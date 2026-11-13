import "server-only";
import crypto from "node:crypto";
import { asPerson, logEvent, now, q, type Queryable, type User } from "./db";
import { discardFiles, drainNow } from "./deletion";
import { handOverFolderCovers, queueDeletion } from "./deletion-core";
import { capacity, reopenCallouts } from "./desk";
import { quarantined } from "./file-digests";
import { alertIfFull } from "./notify";
import { claimUpload, HELD_MAX_TRIES, IntakeError, pointAtSealed, releaseUpload, UploadHeld, UPLOAD_TTL, type Analysis } from "./intake";
import { recordIncident } from "./incidents";
import { FREE_PLAN } from "./plan-store";
import { MAX_UPLOAD_BYTES } from "./plans";
import { allow } from "./ratelimit";
import { scannerAwake, scanStored, SCAN_FAILED, SCAN_REFUSED, type ScanResult } from "./scan";
import { chargeScanner, senderScope } from "./scan-budget";
import { sealUpload, storage } from "./storage";
import { validateAudio } from "./validate";

/**
 * Projects (owner, 13 Nov): a person's own tracks, kept until they delete them. Not desk tracks: they never reach the
 * Review Queue, have no Keep / Not for me, and the nightly clean-up never expires them. Uploads take the same safe path
 * as a send (straight to storage, sealed, checked as real audio, virus-checked, held for the next batch while the
 * scanner sleeps) and have their own allowance per plan (plans.library_limit).
 *
 * Reads and changes run as the signed-in person (asPerson): the database only shows rows on a desk they may work.
 */
export type LibraryTrack = {
  id: number;
  title: string;
  artist: string;
  genre: string;
  mime: string;
  size: number;
  duration: number | null;
  peaks: number[] | null;
  /** The project (folder) it's in; null when it's in none. */
  folder_id: number | null;
  created_at: number;
};

/** A project: a folder of the desk's own tracks (owner, 13 Nov: "folders like collections"). */
export type LibraryFolder = { id: number; name: string; count: number; duration: number; created_at: number };

const COLUMNS = "id, title, artist, genre, mime, size, duration, peaks, folder_id, created_at";
/** The most projects one desk can have: plenty for real use, a stop for scripts. */
export const MAX_FOLDERS = 100;
type Row = Omit<LibraryTrack, "peaks"> & { peaks: string | null };
const toTrack = (r: Row): LibraryTrack => {
  let peaks: number[] | null = null;
  try {
    const p = r.peaks ? JSON.parse(r.peaks) : null;
    if (Array.isArray(p)) peaks = p.map(Number);
  } catch {}
  return { ...r, size: Number(r.size), folder_id: r.folder_id == null ? null : Number(r.folder_id), created_at: Number(r.created_at), duration: r.duration == null ? null : Number(r.duration), peaks };
};

const HOUR = 3_600_000;
/** The most files someone can add to Projects in an hour (the owner-upload rate, shared with adding to collections). */
export const LIBRARY_UPLOADS_PER_HOUR = 60;
const LIBRARY_KIND = "library";

type Desk = Pick<User, "id" | "plan" | "actor_id" | "email">;

/** The plan's Projects allowance in tracks; an unknown plan counts as Free. */
export async function libraryLimit(plan: string, db: Queryable = q) {
  const r = await db.get<{ n: number }>("SELECT library_limit AS n FROM plans WHERE id IN (?, ?) ORDER BY (id = ?) DESC LIMIT 1", plan, FREE_PLAN, plan);
  return Number(r?.n ?? 0);
}

/**
 * The desk's own tracks, newest first: all of them (`folder` left out), those in no project (null), or one project's.
 */
export async function listLibrary(desk: Pick<User, "id" | "actor_id">, folder?: number | null) {
  const where = folder === undefined ? "" : folder === null ? " AND folder_id IS NULL" : " AND folder_id = ?";
  const args = folder == null ? [desk.id] : [desk.id, folder];
  const rows = await asPerson(desk.actor_id, () => q.all<Row>(`SELECT ${COLUMNS} FROM library_tracks WHERE user_id = ?${where} ORDER BY created_at DESC, id DESC`, ...args));
  return rows.map(toTrack);
}

/** Kept tracks plus uploads still in progress (started in the last UPLOAD_TTL, or held for their virus check). */
async function usedOn(db: Queryable, deskId: number) {
  const n = async (sql: string, ...args: unknown[]) => Number((await db.get<{ n: number }>(sql, ...args))?.n ?? 0);
  const kept = await n("SELECT COUNT(*) AS n FROM library_tracks WHERE user_id = ?", deskId);
  const open = await n(
    "SELECT COUNT(*) AS n FROM uploads WHERE receiver_id = ? AND meta::jsonb->>'kind' = ? AND (created_at > ? OR held_at IS NOT NULL)",
    deskId,
    LIBRARY_KIND,
    now() - UPLOAD_TTL,
  );
  return kept + open;
}

/** How much of the allowance is taken (the desk is the signed-in one; counted on the app's connection). */
export async function libraryUsed(desk: Pick<User, "id">) {
  return usedOn(q, desk.id);
}

/** The desk's projects, oldest first, each with its track count and total length in seconds. */
export async function listFolders(desk: Pick<User, "id" | "actor_id">): Promise<LibraryFolder[]> {
  const rows = await asPerson(desk.actor_id, () =>
    q.all<LibraryFolder>(
      `SELECT f.id, f.name, f.created_at, COUNT(t.id) AS count, COALESCE(SUM(t.duration), 0) AS duration
       FROM library_folders f LEFT JOIN library_tracks t ON t.folder_id = f.id AND t.user_id = f.user_id
       WHERE f.user_id = ? GROUP BY f.id, f.name, f.created_at ORDER BY f.created_at, f.id`,
      desk.id,
    ),
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name, count: Number(r.count), duration: Number(r.duration), created_at: Number(r.created_at) }));
}

/** One of the desk's projects, or null when it isn't theirs (or is gone). */
export async function getFolder(desk: Pick<User, "id" | "actor_id">, id: number) {
  if (!Number.isSafeInteger(id)) return null;
  return (await listFolders(desk)).find((f) => f.id === id) ?? null;
}

const folderName = (raw: string) => {
  const name = raw.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!name) throw new IntakeError("Give the project a name.", 400);
  return name;
};

/** A new project; its id. */
export async function createFolder(desk: Pick<User, "id" | "actor_id">, raw: string) {
  const name = folderName(raw);
  return asPerson(desk.actor_id, async () => {
    if ((await q.count("SELECT COUNT(*) AS n FROM library_folders WHERE user_id = ?", desk.id)) >= MAX_FOLDERS) throw new IntakeError(`You can have up to ${MAX_FOLDERS} projects.`, 409);
    return Number((await q.get<{ id: number }>("INSERT INTO library_folders (user_id, name, created_at) VALUES (?,?,?) RETURNING id", desk.id, name, now()))!.id);
  });
}

/** Renames a project. False when it isn't theirs. */
export async function renameFolder(desk: Pick<User, "id" | "actor_id">, id: number, raw: string) {
  const name = folderName(raw);
  return !!(await asPerson(desk.actor_id, () => q.get("UPDATE library_folders SET name = ? WHERE id = ? AND user_id = ? RETURNING id", name, id, desk.id)));
}

/** Deletes a project; its tracks stay in Projects, in no project. False when it isn't theirs. */
export async function deleteFolder(desk: Pick<User, "id" | "actor_id">, id: number) {
  return !!(await asPerson(desk.actor_id, () => q.get("DELETE FROM library_folders WHERE id = ? AND user_id = ? RETURNING id", id, desk.id)));
}

/** Moves one of the desk's tracks into one of its projects, or out of any (null). False when either isn't theirs. */
export async function moveLibraryTrack(desk: Pick<User, "id" | "actor_id">, id: number, folder: number | null) {
  return asPerson(desk.actor_id, async () => {
    if (folder !== null && !(await q.get("SELECT 1 FROM library_folders WHERE id = ? AND user_id = ?", folder, desk.id))) return false;
    return !!(await q.get("UPDATE library_tracks SET folder_id = ? WHERE id = ? AND user_id = ? RETURNING id", folder, id, desk.id));
  });
}

type LibraryMeta = { kind: typeof LIBRARY_KIND; title: string; artist: string; genre: string; originalName: string; email: string; folderId: number | null };

/** Step 1: where to upload the file; the bytes go straight to storage. */
export async function startLibraryUpload(desk: Desk, d: { fileName: string; size: number; title: string; artist: string; genre: string; rights: boolean; folderId?: number | null }) {
  const ext = d.fileName.toLowerCase().match(/\.(wav|mp3)$/)?.[0];
  if (!ext) throw new IntakeError("Only WAV and MP3 files are accepted.", 400);
  if (!Number.isSafeInteger(d.size) || d.size <= 0) throw new IntakeError("Choose a WAV or MP3 file.", 400);
  if (d.size > MAX_UPLOAD_BYTES) throw new IntakeError("That file is over 250 MB. Upload an MP3 or a smaller WAV.", 413);
  if (!d.rights) throw new IntakeError("Confirm you're allowed to keep this file on FloorTest.", 400);
  const title = d.title.trim().slice(0, 200);
  if (!title) throw new IntakeError("Add a track title.", 400);
  const folderId = d.folderId == null ? null : Number(d.folderId);
  if (folderId !== null && !(await getFolder(desk, folderId))) throw new IntakeError("That project isn't there any more. Choose another.", 404);
  const limit = await libraryLimit(desk.plan);
  if (!(await allow("owner_upload", String(desk.id), LIBRARY_UPLOADS_PER_HOUR, HOUR))) throw new IntakeError("Too many uploads. Try again in an hour.", 429);
  const meta: LibraryMeta = {
    kind: LIBRARY_KIND,
    title,
    artist: d.artist.trim().slice(0, 200),
    genre: d.genre.trim().slice(0, 60),
    originalName: d.fileName.slice(0, 255),
    // Charges the virus check to this account's budget, and is who hears if a held file can't be checked.
    email: desk.email.toLowerCase(),
    folderId,
  };
  const id = crypto.randomBytes(24).toString("base64url");
  const key = `library/${desk.id}/${crypto.randomUUID()}${ext}`;
  // Counted and reserved in one step, with the account's row locked, so starts sent at once can't pass the allowance together.
  await q.tx(async (db) => {
    await db.get("SELECT id FROM users WHERE id = ? FOR UPDATE", desk.id);
    if ((await usedOn(db, desk.id)) >= limit) throw new IntakeError(`Projects are full (${limit} tracks on your plan). Delete some or upgrade to add more.`, 409);
    await db.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,?,?,?,?,?)", id, desk.id, key, ext, d.size, JSON.stringify(meta), "owner", now());
  });
  const target = await (await storage()).uploadTarget(key, ext === ".wav" ? "audio/wav" : "audio/mpeg", d.size);
  return { uploadId: id, target };
}

/** The fingerprint of an upload id kept on the row it made, never the id itself (as tracks.upload_ref). */
const uploadRef = (uploadId: string) => crypto.createHash("sha256").update(`library:${uploadId}`).digest("base64url");

/** The row an upload already made, so a retried completion answers the same instead of adding a second copy. */
export async function libraryForUpload(deskId: number, uploadId: string) {
  return q.get<{ id: number }>("SELECT id FROM library_tracks WHERE upload_ref = ? AND user_id = ?", uploadRef(uploadId), deskId);
}

/** Whether an upload row is a Projects upload (for the held-uploads batch). */
export const isLibraryMeta = (meta: { kind?: string }) => meta.kind === LIBRARY_KIND;

type ClaimedUpload = { id: string; file_key: string; size: number; meta: string; held_at: number | null; held_tries: number };
type CompleteOpts = { from?: "request" | "batch"; scanDeadlineMs?: number };

/**
 * Step 2: the file is in storage. Checked like any send (sealed copy, right size, real audio, virus check), then added.
 * `from`: "request" (a sleeping scanner isn't woken; the file is held for the next batch) or "batch" (held-uploads.ts).
 * The desk was checked by the caller (the route's sign-in, or the held upload's own row).
 */
export async function completeLibraryUpload(desk: Pick<User, "id">, uploadId: string, analysis: Analysis, opts: CompleteOpts = {}) {
  const made = await libraryForUpload(desk.id, uploadId);
  if (made) return made;
  const up = await claimUpload<ClaimedUpload>(uploadId, desk.id, "id, file_key, size, meta, held_at, held_tries");
  const meta = JSON.parse(up.meta) as Partial<LibraryMeta>;
  if (!isLibraryMeta(meta)) {
    await releaseUpload(up.id);
    throw new IntakeError("This upload took too long and expired. Upload the track again.", 410);
  }
  try {
    return await finish(desk, up, meta as LibraryMeta, uploadId, analysis, opts);
  } catch (e) {
    // A refusal or a hold has dealt with the file and the claim; anything else keeps the file for the retry or the batch.
    if (!(e instanceof IntakeError || e instanceof UploadHeld)) await releaseUpload(up.id).catch((err) => console.error("[library] couldn't release an upload claim", err));
    throw e;
  }
}

async function finish(desk: Pick<User, "id">, up: ClaimedUpload, meta: LibraryMeta, uploadId: string, analysis: Analysis, opts: CompleteOpts) {
  const store = await storage();
  let fileKey = up.file_key;
  const discard = async () => {
    await discardFiles([fileKey, up.file_key], "library upload discarded", { linkLive: true });
    await q.run("DELETE FROM uploads WHERE id = ?", up.id);
  };
  if (!(await store.head(up.file_key))) {
    await releaseUpload(up.id);
    throw new IntakeError("The file didn't finish uploading. Check your signal and upload it again.", 400);
  }
  // From here on the upload link can't touch the file. A held upload was sealed before it was held.
  if (up.held_at == null) {
    fileKey = await sealUpload(store, up.file_key);
    await pointAtSealed(up.id, up.file_key, fileKey);
  }
  const head = await store.head(fileKey);
  if (!head || Number(head.size) !== Number(up.size) || head.size > MAX_UPLOAD_BYTES) {
    await discard();
    throw new IntakeError("The file that arrived doesn't match the one you chose, so it wasn't saved. Upload it again.", 400);
  }
  const check = await validateAudio({ size: head.size, read: (s, e) => store.read(fileKey, s, e) });
  if (!check.ok) {
    await discard();
    throw new IntakeError(check.reason, 415);
  }
  // Virus check, as for sends (src/lib/intake.ts): nothing flagged or unchecked is added.
  const from = opts.from ?? "request";
  const asleep = from === "request" && (await scannerAwake()) === false;
  const charge = asleep ? null : await chargeScanner(senderScope(meta.email, desk.id));
  const scan: ScanResult = asleep
    ? { verdict: "unavailable", error: "scanner asleep" }
    : charge && !charge.ok
      ? { verdict: "unavailable", error: "scanner budget spent" }
      : await scanStored(fileKey, from === "request" ? { deadlineMs: 45_000 } : opts.scanDeadlineMs ? { deadlineMs: opts.scanDeadlineMs } : {});
  if (scan.verdict === "infected") {
    await discard();
    await recordIncident("upload_rejected", "Virus check flagged an upload", `${scan.signature} · account #${desk.id}`, "library upload");
    throw new IntakeError(SCAN_REFUSED, 422);
  }
  if (scan.verdict === "unavailable") {
    if (scan.file && Number(up.held_tries ?? 0) + 1 >= HELD_MAX_TRIES) {
      await discard();
      await recordIncident("upload_failed", "The virus check kept failing on one Projects upload; it was refused", `${scan.error} · account #${desk.id}`, "library upload");
      throw new IntakeError(SCAN_FAILED, 400);
    }
    await q.run(
      "UPDATE uploads SET held_at = COALESCE(held_at, ?), held_analysis = ?, held_tries = held_tries + ?, claimed_at = NULL WHERE id = ?",
      now(),
      JSON.stringify(analysis),
      scan.file ? 1 : 0,
      up.id,
    );
    if (charge && !charge.ok) throw new UploadHeld(charge.scope === "all" ? "budget_all" : "budget");
    if (!asleep) await recordIncident("upload_failed", "Virus check unavailable; a Projects upload is held for the next batch", scan.error, "library upload");
    throw new UploadHeld(scan.file ? "file" : "scanner");
  }
  // The row and the upload's removal in one step: the abandoned-upload clean-up never deletes a file a row points at.
  return q.tx(async (db) => {
    const row = await db.get<{ id: number }>(
      // The project chosen at the start, if it's still there (deleted meanwhile: in no project).
      `INSERT INTO library_tracks (user_id, title, artist, genre, file_key, original_name, mime, size, duration, bpm, peaks, upload_ref, folder_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,(SELECT id FROM library_folders WHERE id = ? AND user_id = ?),?) RETURNING id`,
      desk.id,
      meta.title,
      meta.artist,
      meta.genre,
      fileKey,
      meta.originalName,
      check.kind === "wav" ? "audio/wav" : "audio/mpeg", // from the file's contents, not its name
      head.size,
      analysis.duration,
      analysis.bpm,
      analysis.peaks ? JSON.stringify(analysis.peaks) : null,
      uploadRef(uploadId),
      meta.folderId ?? null,
      desk.id,
      now(),
    );
    await db.run("DELETE FROM uploads WHERE id = ?", up.id);
    return row!;
  });
}

/** Renames one of the desk's own tracks. False when it isn't theirs (or is gone). */
export async function renameLibraryTrack(desk: Pick<User, "id" | "actor_id">, id: number, d: { title: string; artist: string }) {
  const title = d.title.trim().slice(0, 200);
  if (!title) throw new IntakeError("Add a track title.", 400);
  const r = await asPerson(desk.actor_id, () =>
    q.get("UPDATE library_tracks SET title = ?, artist = ? WHERE id = ? AND user_id = ? RETURNING id", title, d.artist.trim().slice(0, 200), id, desk.id),
  );
  return !!r;
}

/**
 * Deletes one of the desk's own tracks. Who may is checked as the person first; the row goes and its file (with the
 * recovery copy) is queued for deletion in one step, on the app's connection, since the queue isn't the person's.
 */
export async function deleteLibraryTrack(desk: Pick<User, "id" | "actor_id">, id: number) {
  const mine = await asPerson(desk.actor_id, () => q.get("SELECT 1 FROM library_tracks WHERE id = ? AND user_id = ?", id, desk.id));
  if (!mine) return false;
  return q.tx(async (db) => {
    const r = await db.get<{ file_key: string }>("DELETE FROM library_tracks WHERE id = ? AND user_id = ? RETURNING file_key", id, desk.id);
    if (r) await queueDeletion(db, [r.file_key], "library track deleted", now());
    return !!r;
  });
}

/**
 * Moves one of the desk's own uploads (a track it added to a collection itself, never one a sender sent; owner, 13 Nov)
 * out of its collection into Projects, optionally into a project. The audio file stays and now belongs to the Projects
 * row; the desk track is retired as a delete would (its artwork and stems go, its slot frees up), and the move is in
 * the desk's activity. Who may is checked as the person; the move itself runs on the app's connection in one step.
 */
export async function moveTrackToProjects(desk: User, trackId: number, folder: number | null): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  type T = { id: number; sender_id: number; title: string; artist: string; genre: string; file_key: string; original_name: string; mime: string; size: number; duration: number | null; bpm: number | null; peaks: string | null };
  const t = await asPerson(desk.actor_id, () =>
    q.get<T>(
      `SELECT t.id, t.sender_id, t.title, t.artist, t.genre, t.file_key, t.original_name, t.mime, t.size, t.duration, t.bpm, t.peaks
       FROM tracks t JOIN senders s ON s.id = t.sender_id
       WHERE t.id = ? AND t.user_id = ? AND t.deleted_at IS NULL AND t.file_key IS NOT NULL AND s.account_id = ?`,
      trackId,
      desk.id,
      desk.id,
    ),
  );
  if (!t) return { ok: false, error: "Only tracks you added yourself can move to Projects." };
  if (await quarantined(t.file_key)) return { ok: false, error: "That track is held for a check and can't move right now." };
  if (folder !== null && !(await getFolder(desk, folder))) return { ok: false, error: "That project isn't there any more. Choose another." };
  const limit = await libraryLimit(desk.plan);
  const moved = await q.tx(async (db) => {
    await db.get("SELECT id FROM users WHERE id = ? FOR UPDATE", desk.id);
    if ((await usedOn(db, desk.id)) >= limit) return null;
    // Still there and still a live track (a second tap, or a delete meanwhile, finds nothing).
    const live = await db.get("SELECT id FROM tracks WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND file_key = ?", t.id, desk.id, t.file_key);
    if (!live) return 0;
    const row = await db.get<{ id: number }>(
      `INSERT INTO library_tracks (user_id, title, artist, genre, file_key, original_name, mime, size, duration, bpm, peaks, folder_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      desk.id,
      t.title.slice(0, 200) || "Untitled",
      (t.artist ?? "").slice(0, 200),
      (t.genre ?? "").slice(0, 60),
      t.file_key,
      t.original_name ?? "",
      t.mime === "audio/mpeg" ? "audio/mpeg" : "audio/wav",
      t.size,
      t.duration,
      t.bpm,
      t.peaks,
      folder,
      now(),
    );
    // As a delete (src/lib/deletion.ts retireTrackFiles), but the audio is kept: only the artwork and stems go.
    await handOverFolderCovers(db, [t.id]);
    // Read again: a release cover may have just passed to another track.
    const art = (await db.get<{ art_key: string | null }>("SELECT art_key FROM tracks WHERE id = ?", t.id))?.art_key ?? null;
    const stems = await db.all<{ file_key: string }>("SELECT file_key FROM stems WHERE track_id = ?", t.id);
    await queueDeletion(db, [art, ...stems.map((x) => x.file_key)], "track moved to Projects", now());
    await db.run("DELETE FROM stems WHERE track_id = ?", t.id);
    await db.run("UPDATE tracks SET deleted_at = ?, file_key = NULL, art_key = NULL WHERE id = ?", now(), t.id);
    await reopenCallouts(db);
    await logEvent({ user_id: desk.id, actor_id: desk.actor_id, sender_id: t.sender_id, track_id: t.id, type: "deleted", detail: "moved to Projects" }, db);
    return Number(row!.id);
  });
  if (moved === null) return { ok: false, error: `Projects are full (${limit} tracks on your plan). Delete some or upgrade to add more.` };
  if (moved === 0) return { ok: false, error: "That track isn't in the collection any more." };
  await drainNow();
  await alertIfFull(desk.id, await capacity(desk));
  return { ok: true, id: moved };
}
