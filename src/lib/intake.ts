/** Intake: checks before a sender can send, the two-step upload, and confirming a sender's email. */
import { SHARING_TERMS_VERSION } from "./legal";
import { discardFiles } from "@/lib/deletion";
import { queueDeletion } from "./deletion-core";
import "server-only";
import { emailTemplate, fillEmail } from "./email-copy";
import { after } from "next/server";
import { switchOn } from "./switches";
import crypto from "node:crypto";
import { logEvent, now, q, USER_COLUMNS, type Collection, type Queryable, type Sender, type Track, type User } from "./db";
import { noLinks, APP_URL, deliverLater, queueMail } from "./mail";
import { alertIfFull, notifyNewSubmission } from "./notify";
import { ACCEPTED_EXT, MAX_BATCH_TRACKS, MAX_RELEASE_TRACKS, MAX_UPLOAD_BYTES, RATE_PER_EMAIL_PER_DAY, RATE_PER_IP_PER_HOUR } from "./plans";
import { folderLimit } from "./plan-store";
import { allow } from "./ratelimit";
import { sealUpload, storage } from "./storage";
import { validateAudio } from "./validate";
import { scannerAwake, scanStored, SCAN_REFUSED, type ScanResult } from "./scan";
import { recordIncident } from "./incidents";
import { recordStoredDigest } from "./file-digests";
import { activeCollection, capacity, isClosed, isFull, isPaused, pausedMessage, rewardReferral } from "./desk";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** How long a sender has between authorising an upload and completing it. */
export const UPLOAD_TTL = 2 * HOUR;

/** A refusal we can show the sender. Messages stay neutral so spammers learn little. */
/**
 * The file is stored and checked except for the virus scan, which runs in the next batch (src/lib/held-uploads.ts):
 * the scanner was asleep or couldn't be reached. Nothing reaches the desk until it passes; the routes answer 202.
 */
export const UPLOAD_HELD =
  "Received. We're checking it for viruses, which can take up to 10 minutes. It reaches the desk as soon as it passes, and your receipt follows by email.";
export class UploadHeld extends Error {
  constructor() {
    super(UPLOAD_HELD);
  }
}

/** How long a held upload waits for the scanner before the sender is told it wasn't sent. */
export const HELD_TTL = 24 * HOUR;
/** Longest an upload's own request waits for an awake scanner before holding the file instead. */
const REQUEST_SCAN_MS = 45_000;

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
  /** Owner upload: the collection owner added this file to their own collection (no link rules, no emails). */
  ownerCollectionId?: number;
};

/** Most files an owner can add to their own collections in an hour. */
export const OWNER_UPLOADS_PER_HOUR = 60;

/**
 * Owner upload, step 1: the signed-in owner adds a file to one of their own collections (promos that came by email, a
 * USB stick…). Only the owner, only their own collection, checked here and again at step 2. The link rules (paused,
 * closed, callout cap) don't apply; the desk's capacity does. Everyone else sends through the owner's link.
 */
export async function startOwnerUpload(owner: User, collectionId: number, d: { fileName: string; size: number; title: string; artist: string; genre: string; rights: boolean }) {
  const c = await q.get<Collection>("SELECT * FROM collections WHERE id = ? AND user_id = ?", collectionId, owner.id);
  if (!c) throw new IntakeError("Not found", 404);
  const ext = d.fileName.toLowerCase().match(/\.(wav|mp3)$/)?.[0];
  if (!ext || !ACCEPTED_EXT.includes(ext)) throw new IntakeError("Only WAV and MP3 files are accepted.", 400);
  if (!Number.isSafeInteger(d.size) || d.size <= 0) throw new IntakeError("Choose a WAV or MP3 file.", 400);
  if (d.size > MAX_UPLOAD_BYTES) throw new IntakeError("File is too large (max 250 MB).", 413);
  if (!d.rights) throw new IntakeError("Confirm you're allowed to keep this file on FloorTest.", 400);
  if (!d.title.trim()) throw new IntakeError("Add a track title.", 400);
  if ((await capacity(owner)).full) throw new IntakeError("Your desk is full. Clear some tracks or upgrade to add more.", 409);
  if (!(await allow("owner_upload", String(owner.id), OWNER_UPLOADS_PER_HOUR, HOUR))) throw new IntakeError("Too many uploads. Try again in an hour.", 429);
  const meta: SubmissionMeta = {
    name: owner.name,
    email: owner.email.toLowerCase(),
    title: d.title.trim().slice(0, 200),
    artist: d.artist.trim().slice(0, 200),
    message: "",
    releaseStatus: "",
    aiUse: "",
    mixStatus: "",
    genre: d.genre.trim().slice(0, 60),
    originalName: d.fileName.slice(0, 255),
    accountId: owner.id,
    emailConfirmed: true,
    ownerCollectionId: c.id,
  };
  const id = crypto.randomBytes(24).toString("base64url");
  const key = `audio/${owner.id}/${crypto.randomUUID()}${ext}`;
  await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,?,?,?,?,?)", id, owner.id, key, ext, d.size, JSON.stringify(meta), "owner", now());
  const target = await (await storage()).uploadTarget(key, ext === ".wav" ? "audio/wav" : "audio/mpeg", d.size);
  return { uploadId: id, target };
}

/**
 * Step 1 of a submission: check the rules, then authorise a direct upload to storage.
 * The file never passes through the app server.
 */
export async function startUpload(receiver: User, meta: SubmissionMeta, size: number, ip: string) {
  const ext = meta.originalName.toLowerCase().match(/\.(wav|mp3)$/)?.[0];
  if (!ext || !ACCEPTED_EXT.includes(ext)) throw new IntakeError("Only WAV and MP3 files are accepted.", 400);
  if (!Number.isSafeInteger(size) || size <= 0) throw new IntakeError("Choose a WAV or MP3 file.", 400);
  if (size > MAX_UPLOAD_BYTES) throw new IntakeError("File is too large (max 250 MB).", 413);
  const id = crypto.randomBytes(24).toString("base64url");
  const key = `audio/${receiver.id}/${crypto.randomUUID()}${ext}`;
  // Tracks of one release or batch start one at a time (a lock on that group), so each sees the true count and size:
  // starts sent at the same moment can't all get past the caps or all skip the send limits as "not the first".
  const group = meta.release ? `release:${meta.release.id}` : meta.batch ? `batch:${meta.batch}` : null;
  // Only this group's counts and the reservation happen under the lock; the rules that use other queries run after it,
  // and a reservation refused by them is removed.
  const firstOfRelease = await q.tx(async (db) => {
    if (group) await db.get("SELECT pg_advisory_xact_lock(hashtext(?))", `${receiver.id}:${group}`);
    // A release counts as one send: only its first track takes a rate-limit slot, and it holds at most MAX_RELEASE_TRACKS.
    let firstOfRelease = true;
    if (meta.release) {
      const inRelease =
        Number((await db.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM tracks WHERE user_id = ? AND release_id = ?", receiver.id, meta.release.id))?.n ?? 0) +
        Number((await db.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM uploads WHERE receiver_id = ? AND meta::jsonb->'release'->>'id' = ?", receiver.id, meta.release.id))?.n ?? 0);
      // Only the sender who started a release can add to it.
      const owner = await db.get<{ email: string }>("SELECT s.email FROM releases r JOIN senders s ON s.id = r.sender_id WHERE r.id = ? AND r.user_id = ?", meta.release.id, receiver.id);
      if (owner && owner.email !== meta.email) throw new IntakeError("That release belongs to someone else.", 403);
      if (inRelease >= MAX_RELEASE_TRACKS) throw new IntakeError(`A release can have up to ${MAX_RELEASE_TRACKS} tracks.`, 413);
      const cap = await folderLimit(receiver.plan);
      const releaseBytes =
        Number((await db.get<{ n: number }>("SELECT COALESCE(SUM(size), 0) AS n FROM tracks WHERE user_id = ? AND release_id = ?", receiver.id, meta.release.id))?.n ?? 0) +
        Number((await db.get<{ n: number }>("SELECT COALESCE(SUM(size), 0) AS n FROM uploads WHERE receiver_id = ? AND meta::jsonb->'release'->>'id' = ?", receiver.id, meta.release.id))?.n ?? 0);
      if (!cap) throw new IntakeError(`${receiver.name} can't receive folders. Send up to 3 tracks at a time.`, 403);
      if (releaseBytes + size > cap) throw new IntakeError(`This folder is over ${Math.round(cap / 1073741824)} GB, the most ${receiver.name} can receive in one folder.`, 413);
      // The first is the one that passed the send limits: a start still being checked (or refused) doesn't count.
      firstOfRelease =
        Number((await db.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM tracks WHERE user_id = ? AND release_id = ?", receiver.id, meta.release.id))?.n ?? 0) +
          Number((await db.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM uploads WHERE receiver_id = ? AND meta::jsonb->'release'->>'id' = ? AND checked_at IS NOT NULL", receiver.id, meta.release.id))?.n ?? 0) ===
        0;
    } else if (meta.batch) {
      const sum = async (sql: string) => (await db.get<{ n: number; b: number }>(sql, receiver.id, meta.batch))!;
      const done = await sum("SELECT COUNT(*)::int AS n, COALESCE(SUM(size), 0)::bigint AS b FROM tracks WHERE user_id = ? AND batch_id = ?");
      const open = await sum("SELECT COUNT(*)::int AS n, COALESCE(SUM(size), 0)::bigint AS b FROM uploads WHERE receiver_id = ? AND meta::jsonb->>'batch' = ?");
      // Only the sender who started a batch can add to it.
      const owner = await db.get<{ email: string }>("SELECT s.email FROM tracks t JOIN senders s ON s.id = t.sender_id WHERE t.user_id = ? AND t.batch_id = ? LIMIT 1", receiver.id, meta.batch);
      if (owner && owner.email !== meta.email) throw new IntakeError("That send belongs to someone else.", 403);
      if (Number(done.n) + Number(open.n) >= MAX_BATCH_TRACKS) throw new IntakeError(`Up to ${MAX_BATCH_TRACKS} tracks at a time.`, 413);
      if (Number(done.b) + Number(open.b) + size > MAX_UPLOAD_BYTES) throw new IntakeError("These tracks add up to more than 250 MB.", 413);
      const passed = await sum("SELECT COUNT(*)::int AS n, 0::bigint AS b FROM uploads WHERE receiver_id = ? AND meta::jsonb->>'batch' = ? AND checked_at IS NOT NULL");
      firstOfRelease = Number(done.n) + Number(passed.n) === 0;
    }
    await db.run(
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
    return firstOfRelease;
  });
  try {
    await checkIntake(receiver, meta.email, ip, firstOfRelease);
  } catch (e) {
    await q.run("DELETE FROM uploads WHERE id = ?", id);
    throw e;
  }
  await q.run("UPDATE uploads SET checked_at = ? WHERE id = ?", now(), id);
  const target = await (await storage()).uploadTarget(key, ext === ".wav" ? "audio/wav" : "audio/mpeg", size);
  return { uploadId: id, target };
}

type Upload = { id: string; receiver_id: number; file_key: string; ext: string; size: number; meta: string; created_at: number };

/** Another completion is working on this upload right now (the sender's retry, or the held-uploads batch). */
export const BEING_SAVED = "This file is already being saved.";

/** How long a completion holds its claim on an upload; after that (a crash mid-way) a retry can take it again. */
export const CLAIM_MS = 10 * 60_000;

/**
 * Claims an upload for one completion, in one statement: of two completes sent at the same moment, only one gets it.
 * Throws if it expired, is finished, or another completion is working on it.
 */
export async function claimUpload<T>(uploadId: string, receiverId: number, cols = "*") {
  const t = now();
  const up = await q.get<T>(
    `UPDATE uploads SET claimed_at = ? WHERE id = ? AND receiver_id = ? AND (created_at > ? OR held_at > ?) AND (claimed_at IS NULL OR claimed_at < ?) RETURNING ${cols}`,
    t,
    uploadId,
    receiverId,
    t - UPLOAD_TTL,
    t - HELD_TTL,
    t - CLAIM_MS,
  );
  if (up) return up;
  if (await q.get("SELECT 1 FROM uploads WHERE id = ? AND receiver_id = ? AND (created_at > ? OR held_at > ?)", uploadId, receiverId, t - UPLOAD_TTL, t - HELD_TTL))
    throw new IntakeError(BEING_SAVED, 409);
  throw new IntakeError("This upload expired. Please send the track again.", 410);
}

/** The fingerprint of an upload id kept on the track it made (tracks.upload_ref), never the id itself. */
const uploadRef = (uploadId: string) => crypto.createHash("sha256").update(`upload:${uploadId}`).digest("base64url");

/** Lets go of a claim when the file simply isn't there yet, so the sender's retry works. */
export const releaseUpload = (uploadId: string) => q.run("UPDATE uploads SET claimed_at = NULL WHERE id = ?", uploadId);

/**
 * Points an upload at its sealed copy and queues the original for deletion in one step, then deletes the original.
 * A crash before that step leaves the upload as it was (the retry seals again); after it, the original is already queued
 * for the nightly clean-up. Never the other way round: the upload must never point at a deleted file.
 */
export async function pointAtSealed(uploadId: string, original: string, sealed: string) {
  await q.tx(async (db) => {
    await db.run("UPDATE uploads SET file_key = ? WHERE id = ?", sealed, uploadId);
    await queueDeletion(db, [original], "upload sealed", now());
  });
  await discardFiles([original], "upload sealed", { linkLive: true });
}

/**
 * Step 2: the browser has uploaded the file. Verify it's really there, the right size, and real
 * audio, then create the track and tell everyone.
 */
export type Analysis = { duration: number | null; bpm: number | null; peaks: number[] | null };

/** The track an upload already made, if any (looked up by the upload's fingerprint). */
export const trackForUpload = (receiverId: number, uploadId: string) =>
  q.get<Track>("SELECT * FROM tracks WHERE upload_ref = ? AND user_id = ? AND created_at > ?", uploadRef(uploadId), receiverId, now() - UPLOAD_TTL);

type CompleteOpts = { from?: "request" | "batch"; scanDeadlineMs?: number };

/**
 * `from`: "request" (the sender's own request: a sleeping scanner isn't woken, the file is held for the next batch) or
 * "batch" (the held-uploads job, which has woken the scanner and waits up to 150 s for it, or `scanDeadlineMs` if less).
 */
export async function completeUpload(receiver: User, uploadId: string, analysis: Analysis, opts: CompleteOpts = {}) {
  // Once per upload (Codex review, phase B item 2): if the response to a finished completion was lost and the browser
  // asks again, it gets the same track back, with no second track and no second "Delivered" email. The upload id is a
  // secret the sender's browser holds, so only its fingerprint is kept on the track.
  const made = await trackForUpload(receiver.id, uploadId);
  if (made) return made;
  const up = await claimUpload<Upload>(uploadId, receiver.id);
  try {
    return await finishClaimed(receiver, up, uploadRef(uploadId), analysis, opts);
  } catch (e) {
    // A refusal or a hold has already dealt with the file and the claim. Anything else (the database dropped, storage
    // timed out) keeps the file and lets go of the claim, so the sender's retry or the next batch can finish it. If even
    // that fails, the claim runs out by itself after CLAIM_MS.
    if (!(e instanceof IntakeError || e instanceof UploadHeld))
      await releaseUpload(up.id).catch((err) => console.error("[intake] couldn't release an upload claim", err));
    throw e;
  }
}

async function finishClaimed(receiver: User, up: Upload, ref: string, analysis: Analysis, opts: CompleteOpts) {
  const store = await storage();
  const sharing = await switchOn("sharing");
  let fileKey = up.file_key;
  const discard = async () => {
    await discardFiles([fileKey, up.file_key], "upload discarded", { linkLive: true });
    await q.run("DELETE FROM uploads WHERE id = ?", up.id);
  };

  if (!(await store.head(up.file_key))) {
    await releaseUpload(up.id);
    throw new IntakeError("The file didn't finish uploading. Please try again.", 400);
  }
  // From here on the sender's upload link can't touch the file: everything below checks and keeps the sealed copy.
  fileKey = await sealUpload(store, up.file_key);
  // If we crash before the track is saved, the abandoned-upload clean-up still finds (and deletes) the sealed copy.
  await pointAtSealed(up.id, up.file_key, fileKey);
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
  // Virus check on our own scanner (off until SCAN_URL is set); nothing flagged or unchecked reaches the desk. A sleeping
  // scanner isn't woken for one file: the upload is held and the next batch (every 5 minutes) checks it.
  const from = opts.from ?? "request";
  const asleep = from === "request" && (await scannerAwake()) === false;
  const scan: ScanResult = asleep
    ? { verdict: "unavailable", error: "scanner asleep" }
    : await scanStored(fileKey, from === "request" ? { deadlineMs: REQUEST_SCAN_MS } : opts.scanDeadlineMs ? { deadlineMs: opts.scanDeadlineMs } : {});
  if (scan.verdict === "infected") {
    await discard();
    await recordIncident("upload_rejected", "Virus check flagged an upload", `${scan.signature} · receiver #${receiver.id}`, "upload");
    throw new IntakeError(SCAN_REFUSED, 422);
  }
  if (scan.verdict === "unavailable") {
    // Held, not refused: the sealed file stays with its upload, so nobody sends it twice, and nothing reaches the desk
    // until the batch's check passes. The claim is let go so the batch can take it.
    await q.run(
      "UPDATE uploads SET held_at = COALESCE(held_at, ?), held_analysis = ?, held_tries = held_tries + ?, claimed_at = NULL WHERE id = ?",
      now(),
      JSON.stringify(analysis),
      from === "batch" ? 1 : 0,
      up.id,
    );
    // Asleep is the normal case; anything else (down, too slow, misconfigured) is worth a look.
    if (!asleep) await recordIncident("upload_failed", "Virus check unavailable; an upload is held for the next batch", scan.error, "upload");
    throw new UploadHeld();
  }

  const meta = JSON.parse(up.meta) as SubmissionMeta;
  // The sender's "Delivered" email is written in the same transaction as their track (Codex review, phase B item 4):
  // its wording is loaded first, so the transaction only fills it in.
  const delivered = meta.ownerCollectionId ? null : await emailTemplate("delivered");
  let result: { track: Track; sender: Sender; collection: Collection | undefined; mailId: number | null };
  try {
    result = await q.tx(async (db) => {
      // Serialise concurrent completions for this receiver so capacity can't be overshot.
      const fresh = await db.get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? FOR UPDATE`, receiver.id);
      if (!fresh) throw new IntakeError("Receiver not found", 404);
      if (meta.ownerCollectionId) {
        // Owner upload: only into their own collection, and only while the desk has room.
        if (!(await db.get("SELECT 1 FROM collections WHERE id = ? AND user_id = ?", meta.ownerCollectionId, fresh.id))) throw new IntakeError("Not found", 404);
        if ((await capacity(fresh, db)).full) throw new IntakeError("Your desk is full. Clear some tracks or upgrade to add more.", 409);
      } else await checkOpen(fresh, db);
      const sender = (await db.get<Sender>(
        `INSERT INTO senders (user_id, email, name, created_at, account_id, verified_at, links) VALUES (?,?,?,?,?,?,?)
         -- Name and links change only on a send whose email is proven.
         ON CONFLICT (user_id, email) DO UPDATE SET name = CASE WHEN excluded.verified_at IS NOT NULL THEN excluded.name ELSE senders.name END,
           links = CASE WHEN excluded.verified_at IS NOT NULL AND excluded.links <> '[]' THEN excluded.links ELSE senders.links END,
           -- Only a proven send links the sender history to an account (an unconfirmed one could claim someone's email).
           account_id = CASE WHEN excluded.verified_at IS NOT NULL THEN COALESCE(excluded.account_id, senders.account_id) ELSE senders.account_id END,
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
      const collection = meta.ownerCollectionId
        ? await db.get<Collection>("SELECT * FROM collections WHERE id = ? AND user_id = ?", meta.ownerCollectionId, fresh.id)
        : await activeCollection(fresh, db);
      // A capped callout: checked here, under the receiver's row lock, so two sends can't both take the last slot.
      // (The owner's own uploads don't count against their callout's cap.)
      if (collection?.max_tracks && !meta.ownerCollectionId) {
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
                             file_key, original_name, mime, size, duration, bpm, peaks, created_at, share_ok, release_id, sets_ok, ai_use, track_no, musical_key, isrc, batch_id, share_terms, upload_ref)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
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
        meta.release?.id ?? null,
        meta.setsOk ? 1 : 0,
        meta.aiUse || null, // owner uploads carry no sender AI declaration
        meta.trackNo ?? null,
        meta.musicalKey ?? "",
        meta.isrc ?? "",
        meta.batch ?? null,
        // The wording the sender agreed to (the send form shows it whenever the collection allows sharing).
        sharing && collection?.allow_sharing ? (meta.ownerCollectionId ? "owner" : SHARING_TERMS_VERSION) : null,
        ref,
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
      await logEvent({ user_id: fresh.id, sender_id: sender.id, track_id: track.id, type: "submitted", detail: `${meta.ownerCollectionId ? "added by you " : ""}${collection ? `into ${collection.name}` : ""}`.trim() }, db);
      // Single use: if the upload is already gone, this completion made nothing (the transaction is undone).
      if (!(await db.run("DELETE FROM uploads WHERE id = ?", up.id)).changes) throw new IntakeError("This file was already saved.", 409);
      // Everything the sender typed is shown without links: this email goes to whatever address they entered.
      const vars = {
        sender: noLinks(sender.name),
        receiver: fresh.name,
        title: noLinks(track.title),
        artist: noLinks(track.artist),
        for_collection: collection ? ` for ${collection.name}` : "",
        receipt_url: `${APP_URL}/receipt/${track.token}`,
        sent_url: `${APP_URL}/sent`,
      };
      const mailId = delivered
        ? await queueMail({ userId: fresh.id, to: sender.email, secrets: [track.token], subject: fillEmail(delivered.subject, vars).replace(/\s+/g, " "), body: fillEmail(delivered.body, vars) }, db)
        : null;
      return { track, sender, collection, mailId };
    });
  } catch (e) {
    // Only a refusal (desk full, closed, already saved) discards the file; any other failure keeps it (see completeUpload).
    if (e instanceof IntakeError) await discard();
    throw e;
  }

  const { track, sender, mailId } = result;
  // The owner added it themselves: no "Delivered" email to themselves, no new-track alert, no referral reward.
  if (meta.ownerCollectionId || mailId === null) return track;
  deliverLater(mailId);
  // The track is saved: everything else happens after the sender's response, and one failure can't block the others.
  after(async () => {
    const results = await Promise.allSettled([
      notifyNewSubmission(receiver.id, track.id),
      capacity(receiver).then((c) => alertIfFull(receiver.id, c)),
      rewardReferral(receiver.id, sender.email),
      // The sealed file, read back from our own storage (src/lib/file-digests.ts); anything missed is done nightly.
      recordStoredDigest(track.file_key!),
    ]);
    for (const r of results) if (r.status === "rejected") console.error("[intake] after-save step failed", r.reason);
  });
  return track;
}

/* ───────────────────────── Signals ───────────────────────── */
