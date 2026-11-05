import "server-only";
import crypto from "node:crypto";
import { discardFiles } from "@/lib/deletion";
import { queueDeletion } from "@/lib/deletion-core";
import { now, q, type Track } from "@/lib/db";
import { optimizeImage } from "@/lib/image-optimize";
import { imageKind, IMAGE_TYPES as TYPES, type ImageKind } from "@/lib/images";
import { trackArtEnabled } from "@/lib/plan-store";
import { allow } from "@/lib/ratelimit";
import { sealUpload, storage } from "@/lib/storage";
import { receiptWhere } from "./receipt-token";
import { receiptLife } from "./receipt-life";

/**
 * Artwork goes straight to storage like the audio, then is decoded and re-encoded like covers (WebP, metadata
 * stripped), so only a real picture is kept, never bytes riding along behind an image header.
 */
const MAX = 25 * 1024 * 1024;
/** Longest side of stored artwork; plenty for the review screen and the phone app. */
const ART_SIDE = 2000;
/** Artwork can be attached only just after sending, with the track's receipt token. */
const WINDOW_MS = 60 * 60_000;
type Reply = { status: number; body: Record<string, unknown> };
const err = (error: string, status: number): Reply => ({ status, body: { error } });
const KINDS: Record<string, ImageKind> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

type ArtTrack = Pick<Track, "id" | "user_id" | "created_at" | "art_key" | "deleted_at" | "played_out_at" | "stems_requested_at" | "stems_sent"> & {
  art_attached_at: number | null;
  plan: string;
};

const sentTrack = (token: string) => {
  const m = receiptWhere(token, "t");
  // Found whether or not the receiver has deleted it: a deleted track answers exactly as a live one, and its artwork is
  // thrown away at the end (Safety, 4 Nov), so the answer can't tell the sender it was deleted.
  return q.get<ArtTrack>(
    `SELECT t.id, t.user_id, t.created_at, t.art_key, t.art_attached_at, t.deleted_at, t.played_out_at, t.stems_requested_at, t.stems_sent, u.plan
       FROM tracks t JOIN users u ON u.id = t.user_id WHERE ${m.sql}`,
    ...m.args,
  );
};

/**
 * The sender attaches optional artwork to a track they just sent (`ref` is its receipt token). Two steps:
 * `{ type, size }` returns where to upload the file; `{ done: true }` then checks the bytes really are an image.
 *
 * The upload link only ever points at a temporary copy, recorded in `uploads` (kind "track_art"), so an abandoned upload
 * is cleaned up with the others. On `done` the server copies it to a new key (sealed), checks that copy and only then
 * makes a re-encoded copy of it the track's artwork: a sender can't swap the picture after it's been checked (Codex review, 19 Oct).
 */
export async function attachTrackArt(ref: string, body: { type?: string; size?: number; done?: boolean }): Promise<Reply> {
  const t = await sentTrack(ref);
  // A closed receipt answers as an unknown one; a read-only one (played out within the hour) takes nothing new.
  const life = t ? receiptLife(t) : "closed";
  if (!t || life === "closed" || t.created_at < now() - WINDOW_MS) return err("Not found", 404);
  if (life !== "open") return err("This receipt doesn't take artwork any more.", 403);
  if (!(await trackArtEnabled(t.plan))) return err("This receiver doesn't take artwork.", 403);
  const store = await storage();
  // art_attached_at stays through a delete (which clears art_key), so this answers the same on a deleted track.
  if (t.art_key || t.art_attached_at) return err("This track already has artwork.", 409);

  if (body.done) {
    const up = await q.get<{ id: string; file_key: string; ext: string; size: number }>(
      "SELECT id, file_key, ext, size FROM uploads WHERE receiver_id = ? AND meta::jsonb->>'kind' = 'track_art' AND (meta::jsonb->>'trackId')::bigint = ? ORDER BY created_at DESC LIMIT 1",
      t.user_id,
      t.id,
    );
    if (!up) return err("Not found", 404);
    if (!(await store.head(up.file_key))) return err("The image didn't finish uploading. Check your signal and try again.", 400);
    const sealed = await sealUpload(store, up.file_key);
    await discardFiles([up.file_key], "track artwork sealed", { linkLive: true });
    // If we stop here, the abandoned-upload clean-up still finds (and deletes) the sealed copy.
    await q.run("UPDATE uploads SET file_key = ? WHERE id = ?", sealed, up.id);
    const head = await store.head(sealed);
    const first = head ? new Uint8Array(await new Response((await store.stream(sealed, { start: 0, end: 15 })).body).arrayBuffer()) : null;
    let kept = sealed;
    const refuse = async (error: string, status: number) => {
      await discardFiles([kept], "track artwork refused", { linkLive: false });
      await q.run("DELETE FROM uploads WHERE id = ?", up.id);
      return err(error, status);
    };
    if (!head || !first || imageKind(first) !== up.ext || head.size !== Number(up.size) || head.size > MAX) return refuse("Use a JPG, PNG or WebP image under 25 MB.", 415);
    const art = await optimizeImage(new Uint8Array(await new Response((await store.stream(sealed)).body).arrayBuffer()), ART_SIDE).catch(() => null);
    if (!art) return refuse("We couldn't read that image. Try another JPG, PNG or WebP.", 415);
    // The upload record moves to the new key first, so a crash at any later point still leaves every file accounted for.
    kept = `${sealed.slice(0, sealed.lastIndexOf("/") + 1)}${crypto.randomUUID()}.webp`;
    await q.run("UPDATE uploads SET file_key = ? WHERE id = ?", kept, up.id);
    await discardFiles([sealed], "track artwork re-encoded", { linkLive: false });
    await store.put(kept, art, TYPES.webp);
    // Only the first artwork sticks, even if two arrive at once; either way the attach is recorded. A deleted track does
    // the same database work as a live one, and its artwork is queued for removal instead of kept (the file is deleted
    // by the queue, not inside this request), so neither the answer nor its timing tells the sender of the delete.
    const set = await q.tx(async (db) => {
      const row = await db.get<{ id: number }>(
        "UPDATE tracks SET art_key = CASE WHEN deleted_at IS NULL THEN ? ELSE art_key END, art_attached_at = ? WHERE id = ? AND art_key IS NULL AND art_attached_at IS NULL RETURNING id",
        kept,
        now(),
        t.id,
      );
      if (row) await db.run("DELETE FROM uploads WHERE id = ?", up.id);
      if (row && t.deleted_at) await queueDeletion(db, [kept], "track artwork for a deleted track", now());
      return row;
    });
    if (!set) return refuse("This track already has artwork.", 409);
    return { status: 200, body: { ok: true } };
  }

  // Each try hands out an upload link; a handful an hour is plenty for one track's artwork.
  if (!(await allow("track_art", String(t.id), 5, 3_600_000))) return err("Too many tries. Wait a little and try again.", 429);
  const kind = KINDS[String(body.type)];
  const size = Number(body.size);
  if (!kind) return err("Use a JPG, PNG or WebP image.", 415);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX) return err("Artwork must be under 25 MB.", 413);
  const key = `track-art/${t.user_id}/${t.id}-${crypto.randomBytes(6).toString("hex")}.${kind}`;
  await q.run(
    "INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,?,?,?,?,?)",
    crypto.randomBytes(24).toString("base64url"),
    t.user_id,
    key,
    kind,
    size,
    JSON.stringify({ kind: "track_art", trackId: t.id }),
    "",
    now(),
  );
  return { status: 200, body: { target: await store.uploadTarget(key, TYPES[kind], size) } };
}
