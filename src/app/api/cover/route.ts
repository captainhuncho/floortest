import { audit } from "@/lib/audit";
import { discardFiles } from "@/lib/deletion";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { atLeast } from "@/lib/account-members";
import { currentUser, viewingAs } from "@/lib/auth";
import { q } from "@/lib/db";
import { storage } from "@/lib/storage";
import { imageKind, IMAGE_TYPES as TYPES } from "@/lib/images";
import { optimizeImage } from "@/lib/image-optimize";

export const runtime = "nodejs";

const MAX = 8 * 1024 * 1024;
/** Upload or replace the receiver's cover photo (small, so it comes through the app). */
export async function POST(req: Request) {
  // A support "view as" session is read-only.
  const user = (await viewingAs()) ? null : await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The link's cover is part of the public page: the owner and A&R / Admin, never a Member (the page hides it; this is the guard).
  if (!atLeast(user.role, "admin")) return NextResponse.json({ error: "Only the owner or an A&R / Admin can change the cover." }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > MAX + 64 * 1024)
    return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = imageKind(buf);
  if (!kind) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 415 });

  const opt = await optimizeImage(buf, 1600).catch(() => null);
  if (!opt) return NextResponse.json({ error: "We couldn't read that image. Try another JPG, PNG or WebP." }, { status: 415 });
  const store = await storage();
  const key = `covers/${user.id}-${crypto.randomBytes(6).toString("hex")}.webp`;
  await store.put(key, opt, TYPES.webp);
  await q.run("UPDATE users SET cover_key = ? WHERE id = ?", key, user.id);
  await discardFiles([user.cover_key], "cover replaced");
  await audit(user.id, "cover_updated");
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = (await viewingAs()) ? null : await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The link's cover is part of the public page: the owner and A&R / Admin, never a Member (the page hides it; this is the guard).
  if (!atLeast(user.role, "admin")) return NextResponse.json({ error: "Only the owner or an A&R / Admin can change the cover." }, { status: 403 });
  await q.run("UPDATE users SET cover_key = NULL WHERE id = ?", user.id);
  await discardFiles([user.cover_key], "cover removed");
  await audit(user.id, "cover_removed");
  return NextResponse.json({ ok: true });
}
