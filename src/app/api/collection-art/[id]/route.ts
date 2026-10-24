import crypto from "node:crypto";
import { discardFiles } from "@/lib/deletion";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { currentUser, viewingAs } from "@/lib/auth";
import { q, type Collection } from "@/lib/db";
import { activeCollection } from "@/lib/desk";
import { imageKind, IMAGE_TYPES as TYPES } from "@/lib/images";
import { optimizeImage } from "@/lib/image-optimize";
import { storage } from "@/lib/storage";
import { reserveFile, settleFile } from "@/lib/file-reservations";
import { recordDigest } from "@/lib/file-digests";

export const runtime = "nodejs";

const MAX = 8 * 1024 * 1024;
const collectionOf = async (raw: string) => q.get<Collection>("SELECT * FROM collections WHERE id = ?", Number(raw) || 0);

/** The owner's collection, for changing its artwork (never during a read-only support "view as"). */
async function ownCollection(raw: string) {
  if (await viewingAs()) return null;
  const user = await currentUser();
  const c = user ? await collectionOf(raw) : undefined;
  return user && c && c.user_id === user.id ? { user, c } : null;
}

/** Upload or replace a collection's artwork (JPG, PNG or WebP, up to 8 MB, checked by its bytes). */
export async function POST(req: Request, ctx: RouteContext<"/api/collection-art/[id]">) {
  const own = await ownCollection((await ctx.params).id);
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (Number(req.headers.get("content-length") || 0) > MAX + 64 * 1024) return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = imageKind(buf);
  if (!kind) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 415 });
  const opt = await optimizeImage(buf, 1000).catch(() => null);
  if (!opt) return NextResponse.json({ error: "We couldn't read that image. Try another JPG, PNG or WebP." }, { status: 415 });
  const store = await storage();
  const key = `collection-art/${own.c.id}-${crypto.randomBytes(6).toString("hex")}.webp`;
  // Written down first, so a crash before the database points to it can't leave a file nobody knows about.
  await reserveFile(key, "collection_art");
  await store.put(key, opt, TYPES.webp);
  await recordDigest(key, opt);
  await q.run("UPDATE collections SET art_key = ? WHERE id = ?", key, own.c.id);
  await settleFile(key);
  await discardFiles([own.c.art_key], "collection artwork replaced");
  await audit(own.user.id, "collection_updated", `${own.c.name}: artwork`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/collection-art/[id]">) {
  const own = await ownCollection((await ctx.params).id);
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await q.run("UPDATE collections SET art_key = NULL WHERE id = ?", own.c.id);
  await discardFiles([own.c.art_key], "collection artwork removed");
  await audit(own.user.id, "collection_updated", `${own.c.name}: artwork removed`);
  return NextResponse.json({ ok: true });
}

/**
 * The artwork: for its owner, or for anyone while the collection is the one their link is receiving into (it shows
 * on the public link page). The URL carries ?v=<key>, so responses can be cached hard.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/collection-art/[id]">) {
  const c = await collectionOf((await ctx.params).id);
  if (!c?.art_key) return new Response("Not found", { status: 404 });
  const owner = await q.get<{ active_collection_id: number | null }>("SELECT active_collection_id FROM users WHERE id = ?", c.user_id);
  const viewer = await currentUser();
  const isPublic = !!owner && (await activeCollection(owner))?.id === c.id;
  if (!isPublic && viewer?.id !== c.user_id) return new Response("Not found", { status: 404 });
  const store = await storage();
  const type = TYPES[c.art_key.split(".").pop() as keyof typeof TYPES] ?? "application/octet-stream";
  // Private artwork: an hour-long link, like the audio, so access that ends (a teammate removed) ends within the hour.
  // The redirect is kept for 10 minutes, well inside the link's life.
  const signed = await store.signedGetUrl(c.art_key, { contentType: type, expiresIn: 3600 });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, max-age=600" } });
  const head = await store.head(c.art_key);
  if (!head) return new Response("Not found", { status: 404 });
  const { body } = await store.stream(c.art_key);
  return new Response(body, { headers: { "Content-Type": type, "Content-Length": String(head.size), "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
