import "server-only";
import { drainNow, queueDeletion, retireTrackFiles } from "./deletion";
import { switchOn } from "./switches";
import crypto from "node:crypto";
import {
  isDecision,
  logEvent,
  now,
  q,
  USER_COLUMNS,
  type Collection,
  type Decision,
  type Queryable,
  type Sender,
  type Track,
  type User,
} from "./db";
import { APP_URL, sendMail } from "./mail";
import { alertIfFull, notifyNewSubmission } from "./notify";
import {
  ACCEPTED_EXT,
  deletesAt,
  listenThreshold,
  MAX_UPLOAD_BYTES,
  planOf,
  RATE_PER_EMAIL_PER_DAY,
  RATE_PER_IP_PER_HOUR,
  RETAIN_PASSED_DAYS,
  RETAIN_UNREVIEWED_DAYS,
  shareDownloadEnabled,
} from "./plans";
import { allow } from "./ratelimit";
import { storage } from "./storage";
import { validateAudio } from "./validate";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** How long a sender has between authorising an upload and completing it. */
const UPLOAD_TTL = 2 * HOUR;

export async function activeCount(userId: number, db: Queryable = q) {
  return (await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL", userId))!.n;
}

/** Plan limit plus track slots earned through referrals. */
export async function capacity(user: Pick<User, "id" | "plan">, db: Queryable = q) {
  const used = await activeCount(user.id, db);
  const bonus = (await db.get<{ b: number }>("SELECT bonus_songs AS b FROM users WHERE id = ?", user.id))?.b ?? 0;
  const limit = planOf(user.plan).limit + bonus;
  return { used, limit, bonus, full: used >= limit };
}

export const REFERRAL_BONUS = 10;

/**
 * A referral pays out once the invited receiver gets their first track, so only real,
 * active desks earn slots. Both sides get the bonus, once.
 */
async function rewardReferral(receiverId: number) {
  const u = await q.get<{ id: number; name: string; referred_by: number | null }>(
    "UPDATE users SET referral_rewarded_at = ? WHERE id = ? AND referred_by IS NOT NULL AND referral_rewarded_at IS NULL RETURNING id, name, referred_by",
    now(),
    receiverId,
  );
  if (!u?.referred_by) return;
  await q.run("UPDATE users SET bonus_songs = bonus_songs + ? WHERE id IN (?, ?)", REFERRAL_BONUS, u.id, u.referred_by);
  const referrer = await q.get<{ id: number; email: string }>("SELECT id, email FROM users WHERE id = ?", u.referred_by);
  if (referrer)
    await sendMail({
      userId: referrer.id,
      audience: "receiver",
      to: referrer.email,
      subject: `You both got ${REFERRAL_BONUS} more track slots`,
      body: `${u.name} just received their first track on FloorTest. You both get ${REFERRAL_BONUS} extra active tracks.\n\nYour referrals: ${APP_URL}/dashboard/referrals`,
    });
}

export type CollectionSummary = Collection & { count: number; needs_review: number; kept: number };

export async function collectionsFor(userId: number) {
  return q.all<CollectionSummary>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL) AS count,
            (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL AND t.decision IS NULL) AS needs_review,
            (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL AND t.decision = 'kept') AS kept
     FROM collections c WHERE c.user_id = ? ORDER BY c.created_at`,
    userId,
  );
}

export async function userByHandle(handle: string) {
  return q.get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE handle = ? AND suspended_at IS NULL`, handle.toLowerCase());
}

export async function activeCollection(user: Pick<User, "active_collection_id">, db: Queryable = q) {
  return user.active_collection_id ? db.get<Collection>("SELECT * FROM collections WHERE id = ?", user.active_collection_id) : undefined;
}

export const isClosed = (c: Collection | undefined, at = now()) => !!c?.closes_at && c.closes_at <= at;

/** "Pause my link": the receiver is away. Ends on its own at pause_until, if one was set. */
export const isPaused = (u: Pick<User, "paused_at" | "pause_until">, at = now()) => !!u.paused_at && (!u.pause_until || u.pause_until > at);

export function pausedMessage(u: Pick<User, "name" | "pause_until" | "tz">) {
  const until = u.pause_until ? ` until ${new Date(u.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: u.tz })}` : "";
  return `${u.name} is taking a break from submissions${until}.`;
}

export async function ownedTrack(userId: number, trackId: number) {
  if (!Number.isSafeInteger(trackId)) return undefined;
  return q.get<Track>("SELECT * FROM tracks WHERE id = ? AND user_id = ? AND deleted_at IS NULL", trackId, userId);
}

export async function ownedSender(userId: number, senderId: number) {
  if (!Number.isSafeInteger(senderId)) return undefined;
  return q.get<Sender>("SELECT * FROM senders WHERE id = ? AND user_id = ?", senderId, userId);
}

/* ───────────────────────── Intake ───────────────────────── */

/** A refusal we can show the sender. Messages stay neutral so spammers learn little. */
export class IntakeError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

/** Link-level rules: paused, closed, full. */
async function checkOpen(receiver: User, db: Queryable = q) {
  if (await switchOn("uploads_paused", db)) throw new IntakeError("FloorTest is taking a short break for maintenance. Please try again in a little while.", 503);
  if (isPaused(receiver)) throw new IntakeError(pausedMessage(receiver));
  if (isClosed(await activeCollection(receiver, db))) throw new IntakeError(`This callout closed. ${receiver.name} isn't accepting tracks right now.`);
  if ((await capacity(receiver, db)).full) throw new IntakeError(`${receiver.name} isn't accepting new tracks right now.`);
}

/** Blocked across every link by FloorTest, by exact address or by domain. */
export async function platformBlocked(email: string) {
  const e = email.trim().toLowerCase();
  const domain = e.split("@")[1] || "";
  return !!(await q.get("SELECT 1 FROM platform_blocks WHERE (kind = 'email' AND value = ?) OR (kind = 'domain' AND value = ?)", e, domain));
}

/** Every rule a submission must pass before we hand out an upload URL. */
export async function checkIntake(receiver: User, email: string, ip: string) {
  await checkOpen(receiver);
  if (await platformBlocked(email)) throw new IntakeError("This address can't send tracks on FloorTest.", 403);
  if (await q.get("SELECT 1 FROM senders WHERE user_id = ? AND email = ? AND blocked_at IS NOT NULL", receiver.id, email))
    throw new IntakeError(`${receiver.name} isn't accepting tracks from this address.`, 403);
  // Each attempt takes a slot (even if the upload is later abandoned), counted race-safely.
  if (!(await allow("upload_ip", `${receiver.id}:${ip}`, RATE_PER_IP_PER_HOUR, HOUR)))
    throw new IntakeError("Too many uploads from this connection. Try again in an hour.", 429);
  if (!(await allow("upload_email", `${receiver.id}:${email}`, RATE_PER_EMAIL_PER_DAY, DAY)))
    throw new IntakeError(`You've sent ${RATE_PER_EMAIL_PER_DAY} tracks to ${receiver.name} today. Try again tomorrow.`, 429);
}

export type SubmissionMeta = {
  name: string;
  email: string;
  title: string;
  artist: string;
  message: string;
  releaseStatus: string;
  mixStatus: string;
  genre: string;
  originalName: string;
  /** Set when a signed-in FloorTest user sends from their account (their email is already confirmed). */
  accountId?: number;
  accountVerified?: boolean;
  /** Send folders: tracks uploaded together share this id. */
  batch?: string;
  /** The sender lets the receiver play the track in DJ sets, live and on broadcasts. */
  setsOk?: boolean;
};

/**
 * Step 1 of a submission: check the rules, then authorise a direct upload to storage.
 * The file never passes through the app server.
 */
export async function startUpload(receiver: User, meta: SubmissionMeta, size: number, ip: string) {
  const ext = meta.originalName.toLowerCase().match(/\.(wav|mp3)$/)?.[0];
  if (!ext || !ACCEPTED_EXT.includes(ext)) throw new IntakeError("Only WAV and MP3 files are accepted.", 400);
  if (!Number.isSafeInteger(size) || size <= 0) throw new IntakeError("Choose a WAV or MP3 file.", 400);
  if (size > MAX_UPLOAD_BYTES) throw new IntakeError("File is too large (max 250 MB).", 413);
  if (meta.batch) {
    // A folder is capped at MAX_UPLOAD_BYTES in total: what's already sent in it plus what's still uploading.
    const sent = Number((await q.get<{ n: string | number }>("SELECT COALESCE(SUM(size), 0) AS n FROM tracks WHERE user_id = ? AND batch_id = ?", receiver.id, meta.batch))?.n ?? 0);
    const pending = Number((await q.get<{ n: string | number }>("SELECT COALESCE(SUM(size), 0) AS n FROM uploads WHERE receiver_id = ? AND meta::jsonb->>'batch' = ?", receiver.id, meta.batch))?.n ?? 0);
    if (sent + pending + size > MAX_UPLOAD_BYTES) throw new IntakeError("This folder is over 250 MB in total.", 413);
  }
  await checkIntake(receiver, meta.email, ip);

  const id = crypto.randomBytes(24).toString("base64url");
  const key = `audio/${receiver.id}/${crypto.randomUUID()}${ext}`;
  await q.run(
    "INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,?,?,?,?,?)",
    id,
    receiver.id,
    key,
    ext,
    size,
    JSON.stringify(meta),
    ip,
    now(),
  );
  const target = await (await storage()).uploadTarget(key, ext === ".wav" ? "audio/wav" : "audio/mpeg", size);
  return { uploadId: id, target };
}

type Upload = { id: string; receiver_id: number; file_key: string; ext: string; size: number; meta: string; created_at: number };

/**
 * Step 2: the browser has uploaded the file. Verify it's really there, the right size, and real
 * audio, then create the track and tell everyone.
 */
export async function completeUpload(receiver: User, uploadId: string, analysis: { duration: number | null; bpm: number | null; peaks: number[] | null }) {
  const up = await q.get<Upload>("SELECT * FROM uploads WHERE id = ? AND receiver_id = ? AND created_at > ?", uploadId, receiver.id, now() - UPLOAD_TTL);
  if (!up) throw new IntakeError("This upload expired. Please send the track again.", 410);
  const store = await storage();
  const sharing = await switchOn("sharing");
  const discard = async () => {
    await store.delete(up.file_key).catch(() => {});
    await q.run("DELETE FROM uploads WHERE id = ?", up.id);
  };

  const head = await store.head(up.file_key);
  if (!head) throw new IntakeError("The file didn't finish uploading. Please try again.", 400);
  if (head.size !== up.size || head.size > MAX_UPLOAD_BYTES) {
    await discard();
    throw new IntakeError("The uploaded file doesn't match what was expected. Please try again.", 400);
  }
  const check = await validateAudio({ size: head.size, read: (s, e) => store.read(up.file_key, s, e) });
  if (!check.ok) {
    await discard();
    throw new IntakeError(check.reason, 415);
  }

  const meta = JSON.parse(up.meta) as SubmissionMeta;
  let result: { track: Track; sender: Sender; collection: Collection | undefined };
  try {
    result = await q.tx(async (db) => {
      // Serialise concurrent completions for this receiver so capacity can't be overshot.
      const fresh = await db.get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? FOR UPDATE`, receiver.id);
      if (!fresh) throw new IntakeError("Receiver not found", 404);
      await checkOpen(fresh, db);
      const sender = (await db.get<Sender>(
        `INSERT INTO senders (user_id, email, name, created_at, verify_token, account_id, verified_at) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT (user_id, email) DO UPDATE SET name = excluded.name,
           account_id = COALESCE(excluded.account_id, senders.account_id),
           verified_at = COALESCE(senders.verified_at, excluded.verified_at)
         RETURNING *`,
        fresh.id,
        meta.email,
        meta.name,
        now(),
        crypto.randomBytes(16).toString("base64url"),
        meta.accountId ?? null,
        meta.accountId && meta.accountVerified ? now() : null,
      ))!;
      const collection = await activeCollection(fresh, db);
      const track = (await db.get<Track>(
        `INSERT INTO tracks (user_id, collection_id, sender_id, token, title, artist, message, release_status, mix_status, genre,
                             file_key, original_name, mime, size, duration, bpm, peaks, created_at, share_ok, share_download, batch_id, sets_ok)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
        fresh.id,
        collection?.id ?? null,
        sender.id,
        crypto.randomBytes(12).toString("base64url"),
        meta.title,
        meta.artist,
        meta.message,
        meta.releaseStatus,
        meta.mixStatus,
        meta.genre,
        up.file_key,
        meta.originalName,
        check.kind === "wav" ? "audio/wav" : "audio/mpeg", // from the file's contents, not its name
        head.size,
        analysis.duration,
        analysis.bpm,
        analysis.peaks ? JSON.stringify(analysis.peaks) : null,
        now(),
        sharing && collection?.allow_sharing ? 1 : 0,
        sharing && collection?.allow_sharing && shareDownloadEnabled(fresh.plan) ? 1 : 0,
        meta.batch ?? null,
        meta.setsOk ? 1 : 0,
      ))!;
      // Possible duplicate: the same file (byte size and length) already on this desk, or the same
      // sender re-sending the same title. Flagged for the receiver, never blocked.
      const dup = await db.get<{ id: number }>(
        `SELECT id FROM tracks WHERE user_id = ? AND id <> ? AND deleted_at IS NULL
           AND ((size = ? AND (duration IS NULL OR ?::double precision IS NULL OR abs(duration - ?) < 0.5))
             OR (sender_id = ? AND lower(title) = lower(?)))
         ORDER BY created_at LIMIT 1`,
        fresh.id,
        track.id,
        head.size,
        analysis.duration,
        analysis.duration,
        sender.id,
        meta.title,
      );
      if (dup) {
        await db.run("UPDATE tracks SET duplicate_of = ? WHERE id = ?", dup.id, track.id);
        track.duplicate_of = dup.id;
      }
      await logEvent({ user_id: fresh.id, sender_id: sender.id, track_id: track.id, type: "submitted", detail: collection ? `into ${collection.name}` : "" }, db);
      await db.run("DELETE FROM uploads WHERE id = ?", up.id);
      return { track, sender, collection };
    });
  } catch (e) {
    await discard();
    throw e;
  }

  const { track, sender, collection } = result;
  const verify = sender.verified_at
    ? []
    : ["", `Confirm this is your email so ${receiver.name} sees you as a verified sender:`, `${APP_URL}/confirm-sender/${sender.verify_token}`];
  await sendMail({
    userId: receiver.id,
    to: sender.email,
    subject: `Delivered: ${track.artist} – ${track.title}`,
    body: [
      `Hi ${sender.name},`,
      "",
      `"${track.title}" was delivered to ${receiver.name}${collection ? ` for ${collection.name}` : ""}.`,
      `We'll email you when it's listened to, when the original is downloaded, and if ${receiver.name} replies.`,
      "",
      `Your private receipt: ${APP_URL}/receipt/${track.token}`,
      `Everything you've sent, with what happened to each: ${APP_URL}/sent`,
      ...verify,
      "",
      "— FloorTest",
    ].join("\n"),
  });
  await notifyNewSubmission(receiver.id, track.id);
  await alertIfFull(receiver.id, await capacity(receiver));
  await rewardReferral(receiver.id);
  return track;
}

export async function senderByVerifyToken(token: string) {
  return q.get<Sender>("SELECT * FROM senders WHERE verify_token = ?", token);
}

export async function verifySender(token: string) {
  return q.get<Sender>("UPDATE senders SET verified_at = COALESCE(verified_at, ?) WHERE verify_token = ? RETURNING *", now(), token);
}

/* ───────────────────────── Signals ───────────────────────── */

const senderOf = async (t: Track) => (await q.get<Sender>("SELECT * FROM senders WHERE id = ?", t.sender_id))!;

/**
 * Listened: the client reports seconds actually heard (seeks excluded).
 * We only count it once it clears the published threshold.
 */
export async function markListened(user: User, t: Track, secondsHeard: number) {
  if (t.played_at) return false;
  if (!(secondsHeard >= listenThreshold(t.duration) - 0.5)) return false;
  const r = await q.run("UPDATE tracks SET played_at = ? WHERE id = ? AND played_at IS NULL", now(), t.id);
  if (!r.changes) return false;
  const s = await senderOf(t);
  await logEvent({ user_id: user.id, sender_id: s.id, track_id: t.id, type: "played", detail: `${Math.round(secondsHeard)}s` });
  await sendMail({
    userId: user.id,
    to: s.email,
    subject: `Listened: ${t.title}`,
    body: `Hi ${s.name},\n\n${user.name} listened to "${t.title}".\n\nThis means it was played for at least 30 seconds (or a quarter of the track). It doesn't tell you whether it'll be played out.\n\nYour receipt: ${APP_URL}/receipt/${t.token}\nEverything you've sent: ${APP_URL}/sent\n\n— FloorTest`,
  });
  return true;
}

/** Downloaded: called only once the original file has been fully sent. */
export async function markDownloaded(user: User, t: Track) {
  const r = await q.run("UPDATE tracks SET downloaded_at = ? WHERE id = ? AND downloaded_at IS NULL", now(), t.id);
  if (!r.changes) return;
  const s = await senderOf(t);
  await logEvent({ user_id: user.id, sender_id: s.id, track_id: t.id, type: "downloaded", detail: "" });
  await sendMail({
    userId: user.id,
    to: s.email,
    subject: `Downloaded: ${t.title}`,
    body: `Hi ${s.name},\n\n${user.name} downloaded the original file of "${t.title}".\n\nDownloading usually means they want it on hand, but it isn't a promise.\n\nYour receipt: ${APP_URL}/receipt/${t.token}\nEverything you've sent: ${APP_URL}/sent\n\n— FloorTest`,
  });
}

/** The best news a sender can get: their track was played in a set. Once per track; the note is optional. */
export async function markPlayedOut(user: User, t: Track, note: string) {
  const clean = note.replace(/\s+/g, " ").trim().slice(0, 140);
  const r = await q.run("UPDATE tracks SET played_out_at = ?, played_out_note = ? WHERE id = ? AND played_out_at IS NULL", now(), clean, t.id);
  if (!r.changes) return false;
  const s = await senderOf(t);
  await logEvent({ user_id: user.id, sender_id: s.id, track_id: t.id, type: "played_out", detail: clean });
  await sendMail({
    userId: user.id,
    to: s.email,
    subject: `Played out: ${t.title}`,
    body: `Hi ${s.name},\n\n${user.name} played "${t.title}" out in a set${clean ? ` (${clean})` : ""}. 🎛️\n\nYour receipt: ${APP_URL}/receipt/${t.token}\nEverything you've sent: ${APP_URL}/sent\n\n— FloorTest`,
  });
  return true;
}

/* ───────────────────────── Decisions ───────────────────────── */

/** Keep or "not for me" (stored as passed). Private to the receiver: senders are never told. Returns what undo needs. */
export async function decide(user: User, t: Track, decision: Decision) {
  const prev = { decision: t.decision, decided_at: t.decided_at };
  // Keeping (again) always puts the track in the current Prepare for set batch.
  await q.run("UPDATE tracks SET decision = ?, decided_at = ?, set_cleared_at = NULL, expiry_warned_at = NULL WHERE id = ?", decision, now(), t.id);
  const eventId = await logEvent({ user_id: user.id, sender_id: t.sender_id, track_id: t.id, type: decision, detail: "" });
  return { prev, eventId };
}

export async function undoDecision(user: User, t: Track, prev: { decision: unknown; decided_at: unknown }, eventId: number) {
  // The undo token round-trips through the browser: accept only values this app could have produced.
  const decision = isDecision(prev.decision) ? prev.decision : null;
  const decidedAt = decision && typeof prev.decided_at === "number" ? prev.decided_at : null;
  await q.run("UPDATE tracks SET decision = ?, decided_at = ?, expiry_warned_at = NULL WHERE id = ?", decision, decidedAt, t.id);
  if (Number.isSafeInteger(eventId)) await q.run("DELETE FROM events WHERE id = ? AND user_id = ? AND track_id = ?", eventId, user.id, t.id);
}

export async function clearDecision(t: Track) {
  await q.run("UPDATE tracks SET decision = NULL, decided_at = NULL, expiry_warned_at = NULL WHERE id = ?", t.id);
}

export async function reply(user: User, s: Sender, t: Track | undefined, body: string) {
  await sendMail({
    userId: user.id,
    to: s.email,
    subject: t ? `${user.name} replied about "${t.title}"` : `Message from ${user.name}`,
    body: `${body}\n\n— ${user.name}${t ? `\n\nYour receipt: ${APP_URL}/receipt/${t.token}` : ""}\n\nSent via FloorTest`,
  });
  if (t) await q.run("UPDATE tracks SET replied_at = COALESCE(replied_at, ?) WHERE id = ?", now(), t.id);
  await logEvent({ user_id: user.id, sender_id: s.id, track_id: t?.id ?? null, type: "reply", detail: body });
}

/* ───────────────────────── Removal & retention ───────────────────────── */

/** Removes the audio and frees the slot. History stays attached to the sender. */
export async function deleteTrack(user: User, t: Track) {
  await q.tx(async (db) => {
    await retireTrackFiles(db, [t.id], "deleted by receiver");
    await db.run("UPDATE tracks SET deleted_at = ?, file_key = NULL WHERE id = ?", now(), t.id);
  });
  await logEvent({ user_id: user.id, sender_id: t.sender_id, track_id: t.id, type: "deleted", detail: "" });
  await drainNow();
  await alertIfFull(user.id, await capacity(user)); // re-arms the "link paused" email once there's space
}

/**
 * Retention and cleanup. Runs from the daily cron; also opportunistically (at most every
 * 10 minutes per server instance) so single-server installs don't depend on a scheduler.
 */
export async function purgeExpired({ force = false } = {}) {
  const g = globalThis as typeof globalThis & { __floortestPurgeAt?: number };
  const t = now();
  if (!force && g.__floortestPurgeAt && t - g.__floortestPurgeAt < 10 * 60_000) return { expired: 0, abandoned: 0 };
  g.__floortestPurgeAt = t;

  // Rate limits look back at most 24h, so IP addresses aren't kept longer than 48h.
  await q.run("DELETE FROM rate_events WHERE created_at < ?", t - 2 * DAY);
  await q.run("DELETE FROM sessions WHERE expires_at < ?", t);
  await q.run("DELETE FROM password_resets WHERE expires_at < ?", t - DAY);
  await q.run("DELETE FROM login_codes WHERE expires_at < ?", t);
  await q.run("DELETE FROM tap_timings WHERE created_at < ?", t - 30 * DAY);
  await q.run("DELETE FROM job_runs WHERE started_at < ?", t - 90 * DAY);
  await q.run("DELETE FROM feature_use WHERE day < ?", new Date(t - 400 * DAY).toISOString().slice(0, 10));

  const abandoned = await q.all<{ id: string; file_key: string }>("SELECT id, file_key FROM uploads WHERE created_at < ?", t - UPLOAD_TTL);
  for (const u of abandoned)
    await q.tx(async (db) => {
      await queueDeletion(db, [u.file_key], "upload abandoned", t);
      await db.run("DELETE FROM uploads WHERE id = ?", u.id);
    });

  // Retention deletes people's tracks, so it only runs from the nightly job, right after a successful backup.
  // The opportunistic runs above only clear sessions, rate-limit records and abandoned uploads.
  if (!force) {
    await drainNow();
    return { expired: 0, abandoned: abandoned.length, deletions: null };
  }
  const expired = await q.all<Track>(
    `SELECT * FROM tracks WHERE deleted_at IS NULL AND (
       (decision IS NULL AND created_at < ?) OR (decision = 'passed' AND decided_at < ?)) LIMIT 500`,
    t - RETAIN_UNREVIEWED_DAYS * DAY,
    t - RETAIN_PASSED_DAYS * DAY,
  );
  for (const tr of expired) {
    await q.tx(async (db) => {
      await retireTrackFiles(db, [tr.id], "retention");
      await db.run("UPDATE tracks SET deleted_at = ?, file_key = NULL WHERE id = ?", t, tr.id);
    });
    await logEvent({ user_id: tr.user_id, sender_id: tr.sender_id, track_id: tr.id, type: "expired", detail: "" });
  }
  const deletions = await drainNow();
  const left = expired.length === 500 ? await q.count(
    `SELECT COUNT(*) AS n FROM tracks WHERE deleted_at IS NULL AND ((decision IS NULL AND created_at < ?) OR (decision = 'passed' AND decided_at < ?))`,
    t - RETAIN_UNREVIEWED_DAYS * DAY,
    t - RETAIN_PASSED_DAYS * DAY,
  ) : 0;
  // deletions: files removed from storage tonight; left: tracks past retention still waiting (500 a night at most)
  return { expired: expired.length, abandoned: abandoned.length, left, deletions };
}

export { deletesAt };

export async function setBlocked(user: User, s: Sender, blocked: boolean) {
  await q.run("UPDATE senders SET blocked_at = ? WHERE id = ?", blocked ? now() : null, s.id);
  await logEvent({ user_id: user.id, sender_id: s.id, track_id: null, type: blocked ? "blocked" : "unblocked", detail: "" });
}

/** A short, unambiguous invite code, created the first time someone opens Referrals. */
export async function referralCodeFor(userId: number) {
  const existing = (await q.get<{ c: string | null }>("SELECT referral_code AS c FROM users WHERE id = ?", userId))?.c;
  if (existing) return existing;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from(crypto.randomBytes(7), (b) => alphabet[b % alphabet.length]).join("");
    const r = await q.run(
      "UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE referral_code = ?)",
      code,
      userId,
      code,
    );
    if (r.changes) return code;
    const current = (await q.get<{ c: string | null }>("SELECT referral_code AS c FROM users WHERE id = ?", userId))?.c;
    if (current) return current; // set concurrently
  }
  throw new Error("Could not allocate a referral code");
}
