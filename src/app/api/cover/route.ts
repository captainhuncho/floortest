import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { COVER_DIR, db } from "@/lib/db";

export const runtime = "nodejs";

const MAX = 8 * 1024 * 1024;

/** Sniff real image type; the extension and Content-Type are never trusted. */
function imageKind(b: Uint8Array) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

function removeOld(file: string | null) {
  if (file) fs.rmSync(path.join(COVER_DIR, path.basename(file)), { force: true });
}

/** Upload or replace the receiver's cover photo for the Stage page. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = imageKind(buf);
  if (!kind) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 415 });

  const name = `${user.id}-${crypto.randomBytes(6).toString("hex")}.${kind}`;
  fs.writeFileSync(path.join(COVER_DIR, name), buf);
  removeOld(user.cover_file);
  db().prepare("UPDATE users SET cover_file = ? WHERE id = ?").run(name, user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  removeOld(user.cover_file);
  db().prepare("UPDATE users SET cover_file = NULL WHERE id = ?").run(user.id);
  return NextResponse.json({ ok: true });
}
