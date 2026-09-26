import { audit } from "@/lib/audit";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

const MAX = 8 * 1024 * 1024;
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/** Sniff the real image type; the extension and Content-Type are never trusted. */
function imageKind(b: Uint8Array): keyof typeof TYPES | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

/** Upload or replace the receiver's cover photo (small, so it comes through the app). */
export async function POST(req: Request) {
  const user = await currentUser();
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
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.cover_key) await (await storage()).delete(user.cover_key).catch(() => {});
  await q.run("UPDATE users SET cover_key = NULL WHERE id = ?", user.id);
  await audit(user.id, "cover_removed");
  return NextResponse.json({ ok: true });
}
