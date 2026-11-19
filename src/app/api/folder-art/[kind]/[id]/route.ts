import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { atLeast } from "@/lib/account-members";
import { currentDeskForChange, currentUser, viewingAs } from "@/lib/auth";
import { thumbResponse, wantsThumb } from "@/lib/art-thumb";
import { readFormUpTo } from "@/lib/bounded-form";
import { discardFiles } from "@/lib/deletion";
import { quarantined, recordDigest } from "@/lib/file-digests";
import { reserveFile, settleFile } from "@/lib/file-reservations";
import { artRow, isArtKind, setArt, type ArtKind } from "@/lib/folder-art";
import { optimizeImage } from "@/lib/image-optimize";
import { imageKind, IMAGE_TYPES as TYPES } from "@/lib/images";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

const MAX = 8 * 1024 * 1024;
const GONE = "That isn't on your desk any more. Reload the page.";
const MEMBER = "Ask an A&R / Admin to change covers.";

/** The project or folder on the signed-in desk, for changing its cover. Each handler then refuses Members: owner and A&R / Admin only, like renaming or deleting it. */
async function own(params: Promise<{ kind: string; id: string }>) {
  const { kind, id } = await params;
  if (!isArtKind(kind) || (await viewingAs())) return null;
  const user = await currentDeskForChange();
  if (user instanceof Response) return user;
  if (!user) return null;
  const row = await artRow(kind, Number(id));
  return row && row.user_id === user.id ? { user, kind: kind as ArtKind, row } : null;
}

/** Upload or replace the cover (JPG, PNG or WebP, up to 8 MB, checked by its bytes, stored as WebP). */
export async function POST(req: Request, ctx: RouteContext<"/api/folder-art/[kind]/[id]">) {
  const o = await own(ctx.params);
  if (o instanceof Response) return o;
  if (!o) return NextResponse.json({ error: GONE }, { status: 404 });
  const { user } = o;
  if (!atLeast(user.role, "admin")) return NextResponse.json({ error: MEMBER }, { status: 403 });
  // Read with a hard cap, so a body bigger than an image can't be buffered first.
  const form = await readFormUpTo(req, MAX + 64 * 1024);
  if (form === "too-large") return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!imageKind(buf)) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 415 });
  const opt = await optimizeImage(buf, 1000).catch(() => null);
  if (!opt) return NextResponse.json({ error: "We couldn't read that image. Try another JPG, PNG or WebP." }, { status: 415 });
  const store = await storage();
  const key = `folder-art/${o.kind[0]}${o.row.id}-${crypto.randomBytes(6).toString("hex")}.webp`;
  // Written down first, so a crash before the database points to it can't leave a file nobody knows about.
  await reserveFile(key, "folder_art");
  await store.put(key, opt, TYPES.webp);
  await recordDigest(key, opt);
  const old = await setArt(o.kind, o.row.id, user.id, key);
  // Deleted in between: the new file stays reserved and the nightly check removes it.
  if (old === undefined) return NextResponse.json({ error: GONE }, { status: 404 });
  await settleFile(key);
  await discardFiles([old], `${o.kind} cover replaced`);
  return NextResponse.json({ ok: true });
}

/** Back to the plain tile. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/folder-art/[kind]/[id]">) {
  const o = await own(ctx.params);
  if (o instanceof Response) return o;
  if (!o) return NextResponse.json({ error: GONE }, { status: 404 });
  const { user } = o;
  if (!atLeast(user.role, "admin")) return NextResponse.json({ error: MEMBER }, { status: 403 });
  const old = await setArt(o.kind, o.row.id, user.id, null);
  if (old === undefined) return NextResponse.json({ error: GONE }, { status: 404 });
  await discardFiles([old], `${o.kind} cover removed`);
  return NextResponse.json({ ok: true });
}

/** The cover, for anyone working the desk it belongs to (Members too: they can open projects); nobody else. */
export async function GET(req: Request, ctx: RouteContext<"/api/folder-art/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  const row = isArtKind(kind) ? await artRow(kind, Number(id)) : null;
  if (!row?.art_key) return new Response("Not found", { status: 404 });
  const viewer = await currentUser();
  if (viewer?.id !== row.user_id) return new Response("Not found", { status: 404 });
  if (await quarantined(row.art_key)) return new Response("Not found", { status: 404 });
  if (wantsThumb(req)) return thumbResponse(row.art_key, 600);
  const store = await storage();
  // Private: an hour-long link, so access that ends (a teammate removed) ends within the hour; the redirect is kept 10 minutes.
  const signed = await store.signedGetUrl(row.art_key, { contentType: TYPES.webp, expiresIn: 3600 });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, max-age=600" } });
  const head = await store.head(row.art_key);
  if (!head) return new Response("Not found", { status: 404 });
  const { body } = await store.stream(row.art_key);
  return new Response(body, { headers: { "Content-Type": TYPES.webp, "Content-Length": String(head.size), "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
