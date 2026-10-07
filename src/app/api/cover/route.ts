import { audit } from "@/lib/audit";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser, viewingAs } from "@/lib/auth";
import { q } from "@/lib/db";
import { storage } from "@/lib/storage";
import { imageKind, IMAGE_TYPES as TYPES } from "@/lib/images";

export const runtime = "nodejs";

const MAX = 8 * 1024 * 1024;
/** Upload or replace the receiver's cover photo (small, so it comes through the app). */
export async function POST(req: Request) {
  // A support "view as" session is read-only.
  const user = (await viewingAs()) ? null : await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > MAX + 64 * 1024)
    return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = imageKind(buf);
  if (!kind) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 415 });

  const store = await storage();
  const key = `covers/${user.id}-${crypto.randomBytes(6).toString("hex")}.${kind}`;
  await store.put(key, buf, TYPES[kind]);
  if (user.cover_key) await store.delete(user.cover_key).catch(() => {});
  await q.run("UPDATE users SET cover_key = ? WHERE id = ?", key, user.id);
  await audit(user.id, "cover_updated");
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = (await viewingAs()) ? null : await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.cover_key) await (await storage()).delete(user.cover_key).catch(() => {});
  await q.run("UPDATE users SET cover_key = NULL WHERE id = ?", user.id);
  await audit(user.id, "cover_removed");
  return NextResponse.json({ ok: true });
}
