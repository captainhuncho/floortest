/** Intake: checks before a sender can send, the two-step upload, and confirming a sender's email. */
import "server-only";
import { emailText } from "./email-copy";
import { after } from "next/server";
import { switchOn } from "./switches";
import crypto from "node:crypto";
import { logEvent, now, q, USER_COLUMNS, type Collection, type Queryable, type Sender, type Track, type User } from "./db";
import { noLinks, APP_URL, sendMailLater } from "./mail";
import { alertIfFull, notifyNewSubmission } from "./notify";
import { ACCEPTED_EXT, MAX_UPLOAD_BYTES, RATE_PER_EMAIL_PER_DAY, RATE_PER_IP_PER_HOUR } from "./plans";
import { shareDownloadEnabled } from "./plan-store";
import { allow } from "./ratelimit";
import { sealUpload, storage } from "./storage";
import { validateAudio } from "./validate";
import { activeCollection, capacity, isClosed, isPaused, pausedMessage, rewardReferral } from "./desk";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** How long a sender has between authorising an upload and completing it. */
export const UPLOAD_TTL = 2 * HOUR;

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
  let fileKey = up.file_key;
  const discard = async () => {
    await store.delete(fileKey).catch(() => {});
    if (fileKey !== up.file_key) await store.delete(up.file_key).catch(() => {});
    await q.run("DELETE FROM uploads WHERE id = ?", up.id);
  };

  if (!(await store.head(up.file_key))) throw new IntakeError("The file didn't finish uploading. Please try again.", 400);
  // From here on the sender's upload link can't touch the file: everything below checks and keeps the sealed copy.
  fileKey = await sealUpload(store, up.file_key);
  // If we crash before the track is saved, the abandoned-upload clean-up still finds (and deletes) the sealed copy.
  await q.run("UPDATE uploads SET file_key = ? WHERE id = ?", fileKey, up.id);
  const head = await store.head(fileKey);
  if (!head || head.size !== up.size || head.size > MAX_UPLOAD_BYTES) {
    await discard();
    throw new IntakeError("The uploaded file doesn't match what was expected. Please try again.", 400);
  }
  const check = await validateAudio({ size: head.size, read: (s, e) => store.read(fileKey, s, e) });
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
        fileKey,
        meta.originalName,
        check.kind === "wav" ? "audio/wav" : "audio/mpeg", // from the file's contents, not its name
        head.size,
        analysis.duration,
        analysis.bpm,
        analysis.peaks ? JSON.stringify(analysis.peaks) : null,
        now(),
        sharing && collection?.allow_sharing ? 1 : 0,
        sharing && collection?.allow_sharing && (await shareDownloadEnabled(fresh.plan)) ? 1 : 0,
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
  // Everything the sender typed is shown without links: this email goes to whatever address they entered.
  const [sName, sTitle, sArtist] = [noLinks(sender.name), noLinks(track.title), noLinks(track.artist)];
  const verify = sender.verified_at
    ? []
    : ["", `Confirm this is your email so ${receiver.name} sees you as a verified sender:`, `${APP_URL}/confirm-sender/${sender.verify_token}`];
  sendMailLater({
    userId: receiver.id,
    to: sender.email,
    ...(await emailText("delivered", {
      sender: sName,
      receiver: receiver.name,
      title: sTitle,
      artist: sArtist,
      for_collection: collection ? ` for ${collection.name}` : "",
      receipt_url: `${APP_URL}/receipt/${track.token}`,
      sent_url: `${APP_URL}/sent`,
      confirm_block: verify.join("\n"),
    })),
  });
  // The track is saved: everything else happens after the sender's response, and one failure can't block the others.
  after(async () => {
    const results = await Promise.allSettled([
      notifyNewSubmission(receiver.id, track.id),
      capacity(receiver).then((c) => alertIfFull(receiver.id, c)),
      rewardReferral(receiver.id, sender.email),
    ]);
    for (const r of results) if (r.status === "rejected") console.error("[intake] after-save step failed", r.reason);
  });
  return track;
}

export async function senderByVerifyToken(token: string) {
  return q.get<Sender>("SELECT * FROM senders WHERE verify_token = ?", token);
}

export async function verifySender(token: string) {
  return q.get<Sender>("UPDATE senders SET verified_at = COALESCE(verified_at, ?) WHERE verify_token = ? RETURNING *", now(), token);
}

/* ───────────────────────── Signals ───────────────────────── */
