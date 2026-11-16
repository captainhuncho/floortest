import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { readFormUpTo } from "./bounded-form";
import { quarantined, recordDigest } from "./file-digests";
import { reserveFile, settleFile, type FileKind } from "./file-reservations";
import { optimizeImage } from "./image-optimize";
import { imageKind, IMAGE_TYPES as TYPES } from "./images";
import { storage } from "./storage";

/**
 * Cover art shared by callouts (/api/collection-art), projects and folders (/api/folder-art): one way in and one way
 * out. An image is checked by its bytes (JPG, PNG or WebP, up to 8 MB), re-encoded to WebP (which drops EXIF), and
 * stored under a random name the server makes; nothing the person typed goes into the key.
 */
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

/** Reads and re-encodes the uploaded image, or the answer to send back when it isn't one. */
export async function readCover(req: Request): Promise<Uint8Array | Response> {
  // The form is read with a hard cap, so a body bigger than an image can't be buffered first.
  const form = await readFormUpTo(req, MAX_COVER_BYTES + 64 * 1024);
  if (form === "too-large") return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX_COVER_BYTES) return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!imageKind(buf)) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 415 });
  const opt = await optimizeImage(buf, 1000).catch(() => null);
  if (!opt) return NextResponse.json({ error: "We couldn't read that image. Try another JPG, PNG or WebP." }, { status: 415 });
  return opt;
}

/**
 * Stores the image under `<prefix>/<random>.webp` and returns the key. Written down first (file_reservations), so a
 * crash before the database points to it can't leave a file nobody knows about; call `settleFile` once it does.
 */
export async function storeCover(prefix: string, kind: FileKind, opt: Uint8Array) {
  const key = `${prefix}-${crypto.randomBytes(6).toString("hex")}.webp`;
  await reserveFile(key, kind);
  await (await storage()).put(key, opt, TYPES.webp);
  await recordDigest(key, opt);
  return key;
}
export { settleFile };

/** Sends a stored cover the caller may see: an hour-long signed link, or the bytes with nosniff when storage is local. */
export async function serveCover(key: string) {
  // Art that failed its fingerprint check is held back, like every other stored file.
  if (await quarantined(key)) return new Response("Not found", { status: 404 });
  const store = await storage();
  const type = TYPES[key.split(".").pop() as keyof typeof TYPES] ?? "application/octet-stream";
  // Private art: an hour-long link, like the audio, so access that ends (a teammate removed) ends within the hour.
  // The redirect is kept for 10 minutes, well inside the link's life.
  const signed = await store.signedGetUrl(key, { contentType: type, expiresIn: 3600 });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, max-age=600" } });
  const head = await store.head(key);
  if (!head) return new Response("Not found", { status: 404 });
  const { body } = await store.stream(key);
  return new Response(body, { headers: { "Content-Type": type, "Content-Length": String(head.size), "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
