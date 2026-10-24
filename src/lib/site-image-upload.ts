import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { imageKind, IMAGE_TYPES } from "./images";
import { optimizeImage } from "./image-optimize";
import { storage } from "./storage";
import { reserveFile } from "./file-reservations";

const MAX = 5 * 1024 * 1024;

/** Stores an uploaded site image (resized to WebP) and answers with its key; callers check permission first. */
export async function uploadSiteImage(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > MAX + 64 * 1024) return NextResponse.json({ error: "Images must be under 5 MB." }, { status: 413 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Images must be under 5 MB." }, { status: 413 });
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!imageKind(buf)) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 415 });
  const opt = await optimizeImage(buf, 1920).catch(() => null);
  if (!opt) return NextResponse.json({ error: "We couldn't read that image. Try another JPG, PNG or WebP." }, { status: 415 });
  const key = `site/${crypto.randomBytes(9).toString("hex")}.webp`;
  // Written down first. The image only counts as used once a saved draft, the live page or its history mentions it;
  // the nightly check removes it a week on if an edit was abandoned (src/lib/file-reservations.ts).
  await reserveFile(key, "site_image");
  await (await storage()).put(key, opt, IMAGE_TYPES.webp);
  return NextResponse.json({ key });
}
