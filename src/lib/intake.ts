/** Intake: checks before a sender can send, the two-step upload, and confirming a sender's email. */
import "server-only";
import { emailText } from "./email-copy";
import { after } from "next/server";
import { switchOn } from "./switches";
import crypto from "node:crypto";
import { logEvent, now, q, USER_COLUMNS, type Collection, type Queryable, type Sender, type Track, type User } from "./db";
import { noLinks, APP_URL, sendMailLater } from "./mail";
import { alertIfFull, notifyNewSubmission } from "./notify";
import { ACCEPTED_EXT, MAX_BATCH_TRACKS, MAX_RELEASE_TRACKS, MAX_UPLOAD_BYTES, RATE_PER_EMAIL_PER_DAY, RATE_PER_IP_PER_HOUR } from "./plans";
import { folderLimit, shareDownloadEnabled } from "./plan-store";
import { allow } from "./ratelimit";
import { sealUpload, storage } from "./storage";
import { validateAudio } from "./validate";
import { activeCollection, capacity, isClosed, isFull, isPaused, pausedMessage, rewardReferral } from "./desk";

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
  const active = await activeCollection(receiver, db);
  if (isFull(active)) throw new IntakeError(`This callout is full. ${receiver.name} isn't accepting tracks for it right now.`);
  if (isClosed(active)) throw new IntakeError(`This callout closed. ${receiver.name} isn't accepting tracks right now.`);
  if ((await capacity(receiver, db)).full) throw new IntakeError(`${receiver.name} isn't accepting new tracks right now.`);
}

/** Blocked across every link by FloorTest, by exact address or by domain. */
export async function platformBlocked(email: string) {
  const e = email.trim().toLowerCase();
  const domain = e.split("@")[1] || "";
  return !!(await q.get("SELECT 1 FROM platform_blocks WHERE (kind = 'email' AND value = ?) OR (kind = 'domain' AND value = ?)", e, domain));
}

/** Every rule a submission must pass before we hand out an upload URL. */
export async function checkIntake(receiver: User, email: string, ip: string, countsAsSend = true) {
  await checkOpen(receiver);
  if (await platformBlocked(email)) throw new IntakeError("This address can't send tracks on FloorTest.", 403);
  if (await q.get("SELECT 1 FROM senders WHERE user_id = ? AND email = ? AND blocked_at IS NOT NULL", receiver.id, email))
    throw new IntakeError(`${receiver.name} isn't accepting tracks from this address.`, 403);
  // Each attempt takes a slot (even if the upload is later abandoned), counted race-safely. Later tracks of a release don't.
  if (!countsAsSend) return;
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
  /** The sender's AI declaration: none, partial or full. */
  aiUse: string;
  /** Sender's profile links as JSON (already checked); "[]" keeps what they gave before. */
  senderLinks?: string;
  mixStatus: string;
  genre: string;
  originalName: string;
  /** Set when a signed-in FloorTest user sends from their account (their email is already confirmed). */
  accountId?: number;
  /** The email is proven: a code from this browser, or a signed-in account with a confirmed email. */
  emailConfirmed?: boolean;
  /** Send folders: tracks uploaded together share this id. */
  /** Part of a release sent together; the first track's details create it. */
  release?: { id: string; title: string; artist: string; kind: "ep" | "album" };
  /** Up to MAX_BATCH_TRACKS tracks sent together (not a folder): one send, MAX_UPLOAD_BYTES between them. */
  batch?: string;
  trackNo?: number | null;
  musicalKey?: string;
  isrc?: string;
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
  // A release counts as one send: only its first track takes a rate-limit slot, and it holds at most MAX_RELEASE_TRACKS.
  let firstOfRelease = true;
  if (meta.release) {
    const inRelease =
      Number((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM tracks WHERE user_id = ? AND release_id = ?", receiver.id, meta.release.id))?.n ?? 0) +
      Number((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM uploads WHERE receiver_id = ? AND meta::jsonb->'release'->>'id' = ?", receiver.id, meta.release.id))?.n ?? 0);
    // Only the sender who started a release can add to it.
    const owner = await q.get<{ email: string }>("SELECT s.email FROM releases r JOIN senders s ON s.id = r.sender_id WHERE r.id = ? AND r.user_id = ?", meta.release.id, receiver.id);
    if (owner && owner.email !== meta.email) throw new IntakeError("That release belongs to someone else.", 403);
    if (inRelease >= MAX_RELEASE_TRACKS) throw new IntakeError(`A release can have up to ${MAX_RELEASE_TRACKS} tracks.`, 413);
    const cap = await folderLimit(receiver.plan);
    const releaseBytes =
      Number((await q.get<{ n: number }>("SELECT COALESCE(SUM(size), 0) AS n FROM tracks WHERE user_id = ? AND release_id = ?", receiver.id, meta.release.id))?.n ?? 0) +
      Number((await q.get<{ n: number }>("SELECT COALESCE(SUM(size), 0) AS n FROM uploads WHERE receiver_id = ? AND meta::jsonb->'release'->>'id' = ?", receiver.id, meta.release.id))?.n ?? 0);
    if (!cap) throw new IntakeError(`${receiver.name} can't receive folders. Send up to 3 tracks at a time.`, 403);
    if (releaseBytes + size > cap) throw new IntakeError(`This folder is over ${Math.round(cap / 1073741824)} GB, the most ${receiver.name} can receive in one folder.`, 413);
    firstOfRelease = inRelease === 0;
  } else if (meta.batch) {
    const sum = async (sql: string) => (await q.get<{ n: number; b: number }>(sql, receiver.id, meta.batch))!;
    const done = await sum("SELECT COUNT(*)::int AS n, COALESCE(SUM(size), 0)::bigint AS b FROM tracks WHERE user_id = ? AND batch_id = ?");
    const open = await sum("SELECT COUNT(*)::int AS n, COALESCE(SUM(size), 0)::bigint AS b FROM uploads WHERE receiver_id = ? AND meta::jsonb->>'batch' = ?");
    // Only the sender who started a batch can add to it.
    const owner = await q.get<{ email: string }>("SELECT s.email FROM tracks t JOIN senders s ON s.id = t.sender_id WHERE t.user_id = ? AND t.batch_id = ? LIMIT 1", receiver.id, meta.batch);
    if (owner && owner.email !== meta.email) throw new IntakeError("That send belongs to someone else.", 403);
    if (Number(done.n) + Number(open.n) >= MAX_BATCH_TRACKS) throw new IntakeError(`Up to ${MAX_BATCH_TRACKS} tracks at a time.`, 413);
    if (Number(done.b) + Number(open.b) + size > MAX_UPLOAD_BYTES) throw new IntakeError("These tracks add up to more than 250 MB.", 413);
    firstOfRelease = Number(done.n) + Number(open.n) === 0;
  }
  await checkIntake(receiver, meta.email, ip, firstOfRelease);

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
        `INSERT INTO senders (user_id, email, name, created_at, account_id, verified_at, links) VALUES (?,?,?,?,?,?,?)
         -- Name and links change only on a send whose email is proven.
         ON CONFLICT (user_id, email) DO UPDATE SET name = CASE WHEN excluded.verified_at IS NOT NULL THEN excluded.name ELSE senders.name END,
           links = CASE WHEN excluded.verified_at IS NOT NULL AND excluded.links <> '[]' THEN excluded.links ELSE senders.links END,
           account_id = COALESCE(excluded.account_id, senders.account_id),
           verified_at = COALESCE(senders.verified_at, excluded.verified_at)
         RETURNING *`,
        fresh.id,
        meta.email,
        meta.name,
        now(),
        meta.accountId ?? null,
        meta.emailConfirmed ? now() : null,
        meta.senderLinks ?? "[]",
      ))!;
      const collection = await activeCollection(fresh, db);
      // A capped callout: checked here, under the receiver's row lock, so two sends can't both take the last slot.
      if (collection?.max_tracks) {
        const received = Number((await db.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM tracks WHERE collection_id = ? AND deleted_at IS NULL", collection.id))?.n ?? 0);
        if (received >= collection.max_tracks) throw new IntakeError(`“${collection.name}” is full. ${fresh.name} isn't taking more tracks for it.`, 409);
        if (received + 1 >= collection.max_tracks) await db.run("UPDATE collections SET full_at = ? WHERE id = ? AND full_at IS NULL", now(), collection.id);
      }
      if (meta.release)
        await db.run(
          "INSERT INTO releases (id, user_id, sender_id, title, artist, kind, created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING",
          meta.release.id, fresh.id, sender.id, meta.release.title, meta.release.artist, meta.release.kind, now(),
        );
      const track = (await db.get<Track>(
        `INSERT INTO tracks (user_id, collection_id, sender_id, token, title, artist, message, release_status, mix_status, genre,
                             file_key, original_name, mime, size, duration, bpm, peaks, created_at, share_ok, share_download, release_id, sets_ok, ai_use, track_no, musical_key, isrc, batch_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
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
        sharing && collection?.allow_sharing && (await shareDownloadEnabled(fresh.plan, db)) ? 1 : 0,
        meta.release?.id ?? null,
        meta.setsOk ? 1 : 0,
        meta.aiUse,
        meta.trackNo ?? null,
        meta.musicalKey ?? "",
        meta.isrc ?? "",
        meta.batch ?? null,
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

/* ───────────────────────── Signals ───────────────────────── */
