import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  db,
  logEvent,
  now,
  tx,
  UPLOAD_DIR,
  type Collection,
  type Decision,
  type Sender,
  type Track,
  type User,
} from "./db";
import { APP_URL, sendMail } from "./mail";
import { alertIfFull, notifyNewSubmission } from "./notify";
import {
  deletesAt,
  listenThreshold,
  planOf,
  RATE_PER_EMAIL_PER_DAY,
  RATE_PER_IP_PER_HOUR,
  RETAIN_PASSED_DAYS,
  RETAIN_UNREVIEWED_DAYS,
} from "./plans";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function activeCount(userId: number) {
  const r = db().prepare("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL").get(userId) as {
    n: number;
  };
  return r.n;
}

/** Plan limit plus song slots earned through referrals. */
export function capacity(user: Pick<User, "id" | "plan">) {
  const used = activeCount(user.id);
  const bonus = (db().prepare("SELECT bonus_songs AS b FROM users WHERE id = ?").get(user.id) as { b: number } | undefined)?.b ?? 0;
  const limit = planOf(user.plan).limit + bonus;
  return { used, limit, bonus, full: used >= limit };
}

export const REFERRAL_BONUS = 10;

/**
 * A referral pays out once the invited receiver gets their first track, so only real,
 * active desks earn slots. Both sides get the bonus.
 */
async function rewardReferral(receiverId: number) {
  const u = db()
    .prepare("SELECT id, name, referred_by, referral_rewarded_at FROM users WHERE id = ?")
    .get(receiverId) as { id: number; name: string; referred_by: number | null; referral_rewarded_at: number | null };
  if (!u.referred_by || u.referral_rewarded_at) return;
  const r = db().prepare("UPDATE users SET referral_rewarded_at = ? WHERE id = ? AND referral_rewarded_at IS NULL").run(now(), u.id);
  if (!r.changes) return;
  db().prepare("UPDATE users SET bonus_songs = bonus_songs + ? WHERE id IN (?, ?)").run(REFERRAL_BONUS, u.id, u.referred_by);
  const referrer = db().prepare("SELECT id, email, name FROM users WHERE id = ?").get(u.referred_by) as { id: number; email: string; name: string } | undefined;
  if (referrer)
    await sendMail({
      userId: referrer.id,
      audience: "receiver",
      to: referrer.email,
      subject: `You earned ${REFERRAL_BONUS} more song slots`,
      body: `${u.name} just received their first track on FloorTest. You both get ${REFERRAL_BONUS} extra active songs.\n\nYour referrals: ${APP_URL}/dashboard/referrals`,
    });
}

export type CollectionSummary = Collection & { count: number; needs_review: number; kept: number };

export function collectionsFor(userId: number) {
  return db()
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL) AS count,
              (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL AND t.decision IS NULL) AS needs_review,
              (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL AND t.decision = 'kept') AS kept
       FROM collections c WHERE c.user_id = ? ORDER BY c.created_at`,
    )
    .all(userId) as CollectionSummary[];
}

export function userByHandle(handle: string) {
  return db()
    .prepare("SELECT id, email, name, handle, plan, active_collection_id, role_line, cover_file, page_style, paused_at, pause_until, pause_message, created_at FROM users WHERE handle = ?")
    .get(handle.toLowerCase()) as User | undefined;
}

export function activeCollection(user: User) {
  return user.active_collection_id
    ? (db().prepare("SELECT * FROM collections WHERE id = ?").get(user.active_collection_id) as Collection | undefined)
    : undefined;
}

export const isClosed = (c: Collection | undefined, at = now()) => !!c?.closes_at && c.closes_at <= at;

/** "Pause my link": the receiver is away. Ends on its own at pause_until, if one was set. */
export const isPaused = (u: Pick<User, "paused_at" | "pause_until">, at = now()) =>
  !!u.paused_at && (!u.pause_until || u.pause_until > at);

export function pausedMessage(u: Pick<User, "name" | "pause_until" | "pause_message">) {
  const until = u.pause_until ? ` until ${new Date(u.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : "";
  return `${u.name} is taking a break from submissions${until}.`;
}

export function ownedTrack(userId: number, trackId: number) {
  return db().prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ? AND deleted_at IS NULL").get(trackId, userId) as
    | Track
    | undefined;
}

export function ownedSender(userId: number, senderId: number) {
  return db().prepare("SELECT * FROM senders WHERE id = ? AND user_id = ?").get(senderId, userId) as Sender | undefined;
}

export function trackPath(t: Track) {
  return t.file_name ? path.join(UPLOAD_DIR, t.file_name) : null;
}

/* ───────────────────────── Intake ───────────────────────── */

/** A refusal we can show the sender. Messages stay neutral so spammers learn little. */
export class IntakeError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

/** Every rule a submission must pass before we accept bytes. */
export function checkIntake(receiver: User, email: string, ip: string) {
  if (isPaused(receiver)) throw new IntakeError(pausedMessage(receiver));
  const collection = activeCollection(receiver);
  if (isClosed(collection)) throw new IntakeError(`This callout closed. ${receiver.name} isn't accepting tracks right now.`);
  if (capacity(receiver).full) throw new IntakeError(`${receiver.name} isn't accepting new tracks right now.`);

  const blocked = db()
    .prepare("SELECT 1 FROM senders WHERE user_id = ? AND email = ? AND blocked_at IS NOT NULL")
    .get(receiver.id, email);
  if (blocked) throw new IntakeError(`${receiver.name} isn't accepting tracks from this address.`, 403);

  const t = now();
  const byIp = db()
    .prepare("SELECT COUNT(*) AS n FROM upload_attempts WHERE receiver_id = ? AND ip = ? AND created_at > ?")
    .get(receiver.id, ip, t - HOUR) as { n: number };
  if (byIp.n >= RATE_PER_IP_PER_HOUR) throw new IntakeError("Too many uploads from this connection. Try again in an hour.", 429);
  const byEmail = db()
    .prepare("SELECT COUNT(*) AS n FROM upload_attempts WHERE receiver_id = ? AND email = ? AND created_at > ?")
    .get(receiver.id, email, t - DAY) as { n: number };
  if (byEmail.n >= RATE_PER_EMAIL_PER_DAY)
    throw new IntakeError(`You've sent ${RATE_PER_EMAIL_PER_DAY} tracks to ${receiver.name} today. Try again tomorrow.`, 429);
}

export type SubmitInput = {
  receiver: User;
  ip: string;
  name: string;
  email: string;
  title: string;
  artist: string;
  message: string;
  releaseStatus: string;
  mixStatus: string;
  genre: string;
  file: File;
  duration: number | null;
  bpm: number | null;
  peaks: number[] | null;
};

export async function submitTrack(input: SubmitInput) {
  const { receiver } = input;
  const email = input.email.trim().toLowerCase();
  checkIntake(receiver, email, input.ip);

  const ext = path.extname(input.file.name).toLowerCase() === ".wav" ? ".wav" : ".mp3";
  const fileName = `${crypto.randomUUID()}${ext}`;
  const buf = Buffer.from(await input.file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), buf);

  let result: { track: Track; sender: Sender; collection: Collection | undefined };
  try {
    result = tx(() => {
      // Re-check inside the transaction so concurrent uploads cannot overshoot capacity.
      checkIntake(receiver, email, input.ip);
      const d = db();
      d.prepare("INSERT INTO upload_attempts (receiver_id, ip, email, created_at) VALUES (?,?,?,?)").run(receiver.id, input.ip, email, now());
      d.prepare(
        `INSERT INTO senders (user_id, email, name, created_at, verify_token) VALUES (?,?,?,?,?)
         ON CONFLICT(user_id, email) DO UPDATE SET name = excluded.name`,
      ).run(receiver.id, email, input.name.trim(), now(), crypto.randomBytes(16).toString("base64url"));
      const sender = d.prepare("SELECT * FROM senders WHERE user_id = ? AND email = ?").get(receiver.id, email) as Sender;
      const collection = activeCollection(receiver);
      const token = crypto.randomBytes(12).toString("base64url");
      const ins = d
        .prepare(
          `INSERT INTO tracks (user_id, collection_id, sender_id, token, title, artist, message, release_status, mix_status, genre, file_name, original_name, mime, size, duration, bpm, peaks, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          receiver.id,
          collection?.id ?? null,
          sender.id,
          token,
          input.title.trim(),
          input.artist.trim(),
          input.message.trim(),
          input.releaseStatus,
          input.mixStatus,
          input.genre,
          fileName,
          input.file.name,
          ext === ".wav" ? "audio/wav" : "audio/mpeg",
          buf.length,
          input.duration,
          input.bpm,
          input.peaks ? JSON.stringify(input.peaks) : null,
          now(),
        );
      const track = d.prepare("SELECT * FROM tracks WHERE id = ?").get(Number(ins.lastInsertRowid)) as Track;
      logEvent({
        user_id: receiver.id,
        sender_id: sender.id,
        track_id: track.id,
        type: "submitted",
        detail: collection ? `into ${collection.name}` : "",
      });
      return { track, sender, collection };
    });
  } catch (e) {
    fs.rmSync(path.join(UPLOAD_DIR, fileName), { force: true });
    throw e;
  }

  const { track, sender, collection } = result;
  const verify = sender.verified_at
    ? []
    : [``, `Confirm this is your email so ${receiver.name} sees you as a verified sender:`, `${APP_URL}/v/${sender.verify_token}`];
  await sendMail({
    userId: receiver.id,
    to: sender.email,
    subject: `Delivered: ${track.artist} – ${track.title}`,
    body: [
      `Hi ${sender.name},`,
      ``,
      `"${track.title}" was delivered to ${receiver.name}${collection ? ` for ${collection.name}` : ""}.`,
      `We'll email you when it's listened to, when the original is downloaded, and if ${receiver.name} replies.`,
      ``,
      `Your private receipt: ${APP_URL}/t/${track.token}`,
      ...verify,
      ``,
      `— FloorTest`,
    ].join("\n"),
  });
  await notifyNewSubmission(receiver.id, track.id);
  await alertIfFull(receiver.id, capacity(receiver).full);
  await rewardReferral(receiver.id);
  return track;
}

export function verifySender(token: string) {
  const s = db().prepare("SELECT * FROM senders WHERE verify_token = ?").get(token) as Sender | undefined;
  if (!s) return null;
  if (!s.verified_at) db().prepare("UPDATE senders SET verified_at = ? WHERE id = ?").run(now(), s.id);
  return s;
}

/* ───────────────────────── Signals ───────────────────────── */

function senderOf(t: Track) {
  return db().prepare("SELECT * FROM senders WHERE id = ?").get(t.sender_id) as Sender;
}

/**
 * Listened: the client reports seconds actually heard (seeks excluded).
 * We only count it once it clears the published threshold.
 */
export async function markListened(user: User, t: Track, secondsHeard: number) {
  if (t.played_at) return false;
  if (!(secondsHeard >= listenThreshold(t.duration) - 0.5)) return false;
  const r = db().prepare("UPDATE tracks SET played_at = ? WHERE id = ? AND played_at IS NULL").run(now(), t.id);
  if (!r.changes) return false;
  const s = senderOf(t);
  logEvent({ user_id: user.id, sender_id: s.id, track_id: t.id, type: "played", detail: `${Math.round(secondsHeard)}s` });
  await sendMail({
    userId: user.id,
    to: s.email,
    subject: `Listened: ${t.title}`,
    body: `Hi ${s.name},\n\n${user.name} listened to "${t.title}".\n\nThis means it was played for at least 30 seconds (or a quarter of the track). It doesn't say anything about whether it'll be played out.\n\nYour receipt: ${APP_URL}/t/${t.token}\n\n— FloorTest`,
  });
  return true;
}

/** Downloaded: called only once the original file has been fully sent. */
export async function markDownloaded(user: User, t: Track) {
  const fresh = db().prepare("SELECT downloaded_at FROM tracks WHERE id = ?").get(t.id) as { downloaded_at: number | null };
  const first = !fresh.downloaded_at;
  const s = senderOf(t);
  db().prepare("UPDATE tracks SET downloaded_at = COALESCE(downloaded_at, ?) WHERE id = ?").run(now(), t.id);
  if (!first) return;
  logEvent({ user_id: user.id, sender_id: s.id, track_id: t.id, type: "downloaded", detail: "" });
  await sendMail({
    userId: user.id,
    to: s.email,
    subject: `Downloaded: ${t.title}`,
    body: `Hi ${s.name},\n\n${user.name} downloaded the original file of "${t.title}".\n\nYour receipt: ${APP_URL}/t/${t.token}\n\n— FloorTest`,
  });
}

/* ───────────────────────── Decisions ───────────────────────── */

/** Keep or "could be better" (stored as passed). Private to the receiver: senders are never told. Returns what undo needs. */
export function decide(user: User, t: Track, decision: Decision) {
  const prev = { decision: t.decision, decided_at: t.decided_at };
  db().prepare("UPDATE tracks SET decision = ?, decided_at = ? WHERE id = ?").run(decision, now(), t.id);
  const eventId = logEvent({ user_id: user.id, sender_id: t.sender_id, track_id: t.id, type: decision, detail: "" });
  return { prev, eventId };
}

export function undoDecision(
  user: User,
  t: Track,
  prev: { decision: Decision | null; decided_at: number | null },
  eventId: number,
) {
  db().prepare("UPDATE tracks SET decision = ?, decided_at = ? WHERE id = ?").run(prev.decision, prev.decided_at, t.id);
  db().prepare("DELETE FROM events WHERE id = ? AND user_id = ? AND track_id = ?").run(eventId, user.id, t.id);
}

export async function reply(user: User, s: Sender, t: Track | undefined, body: string) {
  await sendMail({
    userId: user.id,
    to: s.email,
    subject: t ? `${user.name} replied about "${t.title}"` : `Message from ${user.name}`,
    body: `${body}\n\n— ${user.name}${t ? `\n\nYour receipt: ${APP_URL}/t/${t.token}` : ""}\n\nSent via FloorTest`,
  });
  if (t) db().prepare("UPDATE tracks SET replied_at = COALESCE(replied_at, ?) WHERE id = ?").run(now(), t.id);
  logEvent({ user_id: user.id, sender_id: s.id, track_id: t?.id ?? null, type: "reply", detail: body });
}

/* ───────────────────────── Removal & retention ───────────────────────── */

function removeFile(t: Track) {
  const p = trackPath(t);
  if (p) fs.rmSync(p, { force: true });
}

/** Removes the audio and frees the slot. History stays attached to the sender. */
export function deleteTrack(user: User, t: Track) {
  db().prepare("UPDATE tracks SET deleted_at = ?, file_name = NULL WHERE id = ?").run(now(), t.id);
  logEvent({ user_id: user.id, sender_id: t.sender_id, track_id: t.id, type: "deleted", detail: "" });
  removeFile(t);
  void alertIfFull(user.id, capacity(user).full); // re-arms the "link paused" email once there's space
}

type G = typeof globalThis & { __floortestPurgeAt?: number };

/** Deletes files past their published retention date. Cheap to call; runs at most every 10 minutes. */
export function purgeExpired() {
  const g = globalThis as G;
  const t = now();
  if (g.__floortestPurgeAt && t - g.__floortestPurgeAt < 10 * 60_000) return;
  g.__floortestPurgeAt = t;
  // Rate limiting only looks back 24h, so IP addresses aren't kept longer than 48h.
  db().prepare("DELETE FROM upload_attempts WHERE created_at < ?").run(t - 2 * DAY);
  const expired = db()
    .prepare(
      `SELECT * FROM tracks WHERE deleted_at IS NULL AND (
         (decision IS NULL AND created_at < ?) OR (decision = 'passed' AND decided_at < ?))`,
    )
    .all(t - RETAIN_UNREVIEWED_DAYS * DAY, t - RETAIN_PASSED_DAYS * DAY) as Track[];
  for (const tr of expired) {
    db().prepare("UPDATE tracks SET deleted_at = ?, file_name = NULL WHERE id = ?").run(t, tr.id);
    logEvent({ user_id: tr.user_id, sender_id: tr.sender_id, track_id: tr.id, type: "expired", detail: "" });
    removeFile(tr);
  }
}

export { deletesAt };

export function setBlocked(user: User, s: Sender, blocked: boolean) {
  db().prepare("UPDATE senders SET blocked_at = ? WHERE id = ?").run(blocked ? now() : null, s.id);
  logEvent({ user_id: user.id, sender_id: s.id, track_id: null, type: blocked ? "blocked" : "unblocked", detail: "" });
}

/** A short, unambiguous invite code, created the first time someone opens Referrals. */
export function referralCodeFor(userId: number) {
  const existing = (db().prepare("SELECT referral_code AS c FROM users WHERE id = ?").get(userId) as { c: string | null }).c;
  if (existing) return existing;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    const code = Array.from(crypto.randomBytes(7), (b) => alphabet[b % alphabet.length]).join("");
    try {
      db().prepare("UPDATE users SET referral_code = ? WHERE id = ?").run(code, userId);
      return code;
    } catch {
      // unique collision: try another
    }
  }
}
