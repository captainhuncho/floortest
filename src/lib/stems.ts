import "server-only";
import { discardFiles } from "@/lib/deletion";
import crypto from "node:crypto";
import { claimUpload, IntakeError, releaseUpload } from "./intake";
import { now, q, type Sender, type Track, type User } from "./db";
import { APP_URL, sendMail } from "./mail";
import { MAX_UPLOAD_BYTES } from "./plans";
import { featureOn } from "./features";
import { recentCount, record } from "./ratelimit";
import { sealUpload, storage } from "./storage";
import { validateAudio } from "./validate";
import { scanStored, SCAN_REFUSED, SCAN_UNAVAILABLE } from "./scan";
import { recordIncident } from "./incidents";

export type Stem = { id: number; track_id: number; file_key: string; name: string; mime: string; size: number; created_at: number };

/** Plenty for a full multitrack, small enough that a link can't be used as free storage. */
export const MAX_STEMS = 24;
const HOUR = 3_600_000;
const UPLOAD_TTL = 2 * HOUR;

export async function stemsFor(trackId: number) {
  return q.all<Stem>("SELECT * FROM stems WHERE track_id = ? ORDER BY name", trackId);
}

/** What the sender's receipt lists: every stem they sent, whether or not the track is still on the desk. */
export function stemsSent(t: Pick<Track, "stems_sent">): string[] {
  try {
    const list = JSON.parse(t.stems_sent || "[]");
    return Array.isArray(list) ? list.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

/** The receiver asks for stems: marks the track and emails the sender a link to their receipt. */
export async function requestStems(user: User, t: Track) {
  if (!(await featureOn("stems", user))) return;
  const s = await q.get<Sender>("SELECT * FROM senders WHERE id = ?", t.sender_id);
  if (!s || t.deleted_at) return;
  const first = !t.stems_requested_at;
  await q.run("UPDATE tracks SET stems_requested_at = ? WHERE id = ?", now(), t.id);
  if (!first) return; // one email per track, however many times the button is pressed
  await sendMail({
    userId: user.id,
    audience: "sender",
    to: s.email,
    secrets: [t.token],
    subject: `${user.name} asked for the stems of "${t.title}"`,
    body: [
      `${user.name} liked "${t.title}" and asked for the stems.`,
      "",
      `Upload them here as WAV or MP3 files (one file per stem, up to ${MAX_STEMS}): ${APP_URL}/receipt/${t.token}`,
      "",
      "Only they can hear or download them.",
    ].join("\n"),
  });
}

/**
 * The receipt's stems request stays open after the track leaves the desk: closing it then would tell the sender the
 * track was removed (Not for me leaves after 30 days, undecided after 90). Stems sent to a removed track are checked
 * like any other, then discarded; the receipt lists them as sent.
 */
async function trackForStems(token: string) {
  const t = await q.get<Track>("SELECT * FROM tracks WHERE token = ?", token);
  if (!t) throw new IntakeError("This track is no longer available.", 404);
  if (!t.stems_requested_at) throw new IntakeError("Stems weren't requested for this track.", 403);
  const plan = (await q.get<{ plan: string }>("SELECT plan FROM users WHERE id = ?", t.user_id))?.plan ?? "free";
  if (!(await featureOn("stems", { id: t.user_id, plan }))) throw new IntakeError("Not found", 404);
  return t;
}

/** Step 1 of a stem upload, from the sender's receipt page. The bytes go straight to storage. */
export async function startStemUpload(token: string, fileName: string, size: number, ip: string) {
  const t = await trackForStems(token);
  const ext = fileName.toLowerCase().match(/\.(wav|mp3)$/)?.[0];
  if (!ext) throw new IntakeError("Stems must be WAV or MP3 files.", 400);
  if (!Number.isSafeInteger(size) || size <= 0) throw new IntakeError("Choose a WAV or MP3 file.", 400);
  if (size > MAX_UPLOAD_BYTES) throw new IntakeError("That stem is too large (max 250 MB).", 413);
  // Stems still uploading count too, so starting many before finishing any can't get past the cap.
  const open = await q.count("SELECT COUNT(*) AS n FROM uploads WHERE receiver_id = ? AND created_at > ? AND meta::jsonb->>'kind' = 'stem' AND (meta::jsonb->>'trackId')::bigint = ?", t.user_id, now() - UPLOAD_TTL, t.id);
  if (stemsSent(t).length + open >= MAX_STEMS) throw new IntakeError(`That's the maximum of ${MAX_STEMS} stems for this track.`, 409);
  if ((await recentCount("stem_ip", `${t.id}:${ip}`, HOUR)) >= MAX_STEMS * 2) throw new IntakeError("Too many uploads. Try again in an hour.", 429);
  await record("stem_ip", `${t.id}:${ip}`);

  const id = crypto.randomBytes(24).toString("base64url");
  const key = `stems/${t.user_id}/${t.id}/${crypto.randomUUID()}${ext}`;
  const name = fileName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 150);
  await q.run(
    "INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,?,?,?,?,?)",
    id,
    t.user_id,
    key,
    ext,
    size,
    JSON.stringify({ kind: "stem", trackId: t.id, name }),
    ip,
    now(),
  );
  const target = await (await storage()).uploadTarget(key, ext === ".wav" ? "audio/wav" : "audio/mpeg", size);
  return { uploadId: id, target };
}

/** Step 2: the stem is in storage. Check it's the right size and real audio, then attach it to the track. */
export async function completeStemUpload(token: string, uploadId: string) {
  const t = await trackForStems(token);
  // Claimed first: of two completes sent at the same moment, only one goes on.
  const up = await claimUpload<{ id: string; file_key: string; size: number; meta: string }>(uploadId, t.user_id, "id, file_key, size, meta");
  const meta = JSON.parse(up.meta) as { kind?: string; trackId?: number; name?: string };
  if (meta?.kind !== "stem" || meta.trackId !== t.id) {
    await releaseUpload(up.id);
    throw new IntakeError("This upload expired. Please try again.", 410);
  }
  const store = await storage();
  let fileKey = up.file_key;
  const discard = async () => {
    await discardFiles([fileKey, up.file_key], "stem upload discarded", { linkLive: true });
    await q.run("DELETE FROM uploads WHERE id = ?", up.id);
  };
  if (!(await store.head(up.file_key))) {
    await releaseUpload(up.id);
    throw new IntakeError("The file didn't finish uploading. Please try again.", 400);
  }
  // Checked and kept as a sealed copy the sender's upload link can't overwrite.
  fileKey = await sealUpload(store, up.file_key);
  await discardFiles([up.file_key], "upload sealed", { linkLive: true });
  // If we crash before the track is saved, the abandoned-upload clean-up still finds (and deletes) the sealed copy.
  await q.run("UPDATE uploads SET file_key = ? WHERE id = ?", fileKey, up.id);
  const head = await store.head(fileKey);
  if (!head || head.size !== up.size) {
    await discard();
    throw new IntakeError("The uploaded file doesn't match what was expected. Please try again.", 400);
  }
  const check = await validateAudio({ size: head.size, read: (s, e) => store.read(fileKey, s, e) });
  if (!check.ok) {
    await discard();
    throw new IntakeError(check.reason, 415);
  }
  // Virus check on our own scanner (off until SCAN_URL is set); nothing flagged or unchecked reaches the desk.
  const scan = await scanStored(fileKey);
  if (scan.verdict === "infected" || scan.verdict === "unavailable") {
    // A flagged file goes. When the scanner can't be reached, the sealed file stays with its upload, so the sender's
    // browser can ask again without sending it twice (the abandoned-upload clean-up removes it if they never do).
    if (scan.verdict === "infected") await discard();
    await recordIncident(
      scan.verdict === "infected" ? "upload_rejected" : "upload_failed",
      scan.verdict === "infected" ? "Virus check flagged an upload" : "Virus check unavailable; an upload was refused",
      scan.verdict === "infected" ? `${scan.signature} · receiver #${t.user_id}` : scan.error,
      "stem upload",
    );
    throw new IntakeError(scan.verdict === "infected" ? SCAN_REFUSED : SCAN_UNAVAILABLE, scan.verdict === "infected" ? 422 : 503);
  }
  const name = meta.name || "Stem";
  // Counted and added in one statement, so the cap holds however many finish at once.
  const sent = (db: Pick<typeof q, "get"> = q) =>
    db.get(
      `UPDATE tracks SET stems_sent = (COALESCE(stems_sent, '[]')::jsonb || to_jsonb(?::text))::text
       WHERE id = ? AND jsonb_array_length(COALESCE(stems_sent, '[]')::jsonb) < ? RETURNING id`,
      name,
      t.id,
      MAX_STEMS,
    );
  const full = () => new IntakeError(`That's the maximum of ${MAX_STEMS} stems for this track.`, 409);
  if (t.deleted_at) {
    await discard();
    if (!(await sent())) throw full();
    return { name, size: head.size };
  }
  const previous = (await q.get<{ at: number | null }>("SELECT MAX(created_at) AS at FROM stems WHERE track_id = ?", t.id))?.at ?? null;
  let stem: Stem;
  try {
    stem = await q.tx(async (db) => {
      if (!(await sent(db))) throw full();
      if (!(await db.run("DELETE FROM uploads WHERE id = ?", up.id)).changes) throw new IntakeError("This file was already saved.", 409);
      return (await db.get<Stem>(
        "INSERT INTO stems (track_id, file_key, name, mime, size, created_at) VALUES (?,?,?,?,?,?) RETURNING *",
        t.id,
        fileKey,
        name,
        check.kind === "wav" ? "audio/wav" : "audio/mpeg",
        head.size,
        now(),
      ))!;
    });
  } catch (e) {
    await discard();
    throw e;
  }

  // One email per batch: only when nothing else arrived for this track in the last half hour.
  if (!previous || now() - previous > HOUR / 2) {
    const r = await q.get<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = ?", t.user_id);
    if (r)
      await sendMail({
        userId: t.user_id,
        audience: "receiver",
        to: r.email,
        subject: `Stems are arriving for "${t.title}"`,
        body: `${t.artist} is uploading the stems you asked for.\n\nThey'll be on the track here: ${APP_URL}/dashboard?view=queue&s=all&t=${t.id}`,
      });
  }
  return stem;
}
