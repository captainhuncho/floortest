import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/admin";
import { imageKind, IMAGE_TYPES } from "@/lib/images";
import { optimizeImage } from "@/lib/image-optimize";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

const MAX = 5 * 1024 * 1024;

/** Admin → Site content: upload an image for a page. Returns its storage key; the editor saves it into the draft. */
export async function POST(req: Request) {
  await requireAdminAction("content");
  if (Number(req.headers.get("content-length") || 0) > MAX + 64 * 1024) return NextResponse.json({ error: "Images must be under 5 MB." }, { status: 413 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Images must be under 5 MB." }, { status: 413 });
  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = imageKind(buf);
  if (!kind) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 415 });
  const opt = await optimizeImage(buf, 1920).catch(() => null);
  if (!opt) return NextResponse.json({ error: "We couldn't read that image. Try another JPG, PNG or WebP." }, { status: 415 });
  const key = `site/${crypto.randomBytes(9).toString("hex")}.webp`;
  await (await storage()).put(key, opt, IMAGE_TYPES.webp);
  return NextResponse.json({ key });
}
