import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { now, q, type Track } from "@/lib/db";
import { imageKind, IMAGE_TYPES as TYPES, type ImageKind } from "@/lib/images";
import { trackArtEnabled } from "@/lib/plan-store";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** Artwork is kept exactly as sent (no resizing or re-encoding), so it goes straight to storage like the audio. */
const MAX = 25 * 1024 * 1024;
/** Artwork can be attached only just after sending, with the track's receipt token. */
const WINDOW_MS = 60 * 60_000;
const err = (error: string, status: number) => NextResponse.json({ error }, { status });
const KINDS: Record<string, ImageKind> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const sentTrack = (token: string) =>
  q.get<Track & { plan: string }>("SELECT t.*, u.plan FROM tracks t JOIN users u ON u.id = t.user_id WHERE t.token = ? AND t.deleted_at IS NULL", token);

/**
 * The sender attaches optional artwork to a track they just sent (`ref` is its receipt token). Two steps:
 * `{ type, size }` returns where to upload the file; `{ done: true }` then checks the bytes really are an image.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/track-art/[ref]">) {
  const t = await sentTrack((await ctx.params).ref);
  if (!t || t.created_at < now() - WINDOW_MS) return err("Not found", 404);
  if (!(await trackArtEnabled(t.plan))) return err("This receiver doesn't take artwork.", 403);
  const body = ((await req.json().catch(() => null)) ?? {}) as { type?: string; size?: number; done?: boolean };
  const store = await storage();

  if (body.done) {
    if (!t.art_key) return err("Not found", 404);
    const head = await store.head(t.art_key).catch(() => null);
    const first = head ? new Uint8Array(await new Response((await store.stream(t.art_key, { start: 0, end: 15 })).body).arrayBuffer()) : null;
    const ext = t.art_key.split(".").pop();
    if (!first || imageKind(first) !== ext || head!.size > MAX) {
      await store.delete(t.art_key).catch(() => {});
      await q.run("UPDATE tracks SET art_key = NULL WHERE id = ?", t.id);
      return err("Use a JPG, PNG or WebP image under 25 MB.", 415);
    }
    return NextResponse.json({ ok: true });
  }

  const kind = KINDS[String(body.type)];
  const size = Number(body.size);
  if (!kind) return err("Use a JPG, PNG or WebP image.", 415);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX) return err("Artwork must be under 25 MB.", 413);
  // Only the first artwork sticks, even if two arrive at once.
  const key = `track-art/${t.user_id}/${t.id}-${crypto.randomBytes(6).toString("hex")}.${kind}`;
  const set = await q.get<{ id: number }>("UPDATE tracks SET art_key = ? WHERE id = ? AND art_key IS NULL RETURNING id", key, t.id);
  if (!set) return err("This track already has artwork.", 409);
  return NextResponse.json({ target: await store.uploadTarget(key, TYPES[kind], size) });
}

/** The artwork, for the receiver only (`ref` is the track id). The URL carries ?v=<key>, so it can be cached. */
export async function GET(_req: Request, ctx: RouteContext<"/api/track-art/[ref]">) {
  const [user, t] = await Promise.all([
    currentUser(),
    q.get<{ user_id: number; art_key: string | null }>("SELECT user_id, art_key FROM tracks WHERE id = ? AND deleted_at IS NULL", Number((await ctx.params).ref) || 0),
  ]);
  if (!t?.art_key || !user || user.id !== t.user_id) return new Response("Not found", { status: 404 });
  const type = TYPES[t.art_key.split(".").pop() as ImageKind] ?? "application/octet-stream";
  const store = await storage();
  const signed = await store.signedGetUrl(t.art_key, { contentType: type, expiresIn: 86_400 });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, max-age=3600" } });
  const head = await store.head(t.art_key);
  if (!head) return new Response("Not found", { status: 404 });
  const { body } = await store.stream(t.art_key);
  return new Response(body, { headers: { "Content-Type": type, "Content-Length": String(head.size), "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
