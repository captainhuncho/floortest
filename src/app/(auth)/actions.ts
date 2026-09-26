"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { db, now, tx } from "@/lib/db";
import { RESERVED_HANDLES } from "@/lib/plans";

export type FormState = { error?: string } | undefined;

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const handle = String(form.get("handle") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");

  if (!name || !email || !handle || !password) return { error: "All fields are required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
  if (!/^[a-z0-9][a-z0-9-_]{1,29}$/.test(handle)) return { error: "Link names use 2–30 letters, numbers, - or _." };
  if (RESERVED_HANDLES.has(handle)) return { error: "That link name is reserved." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const d = db();
  if (d.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return { error: "An account with that email exists." };
  if (d.prepare("SELECT 1 FROM users WHERE handle = ?").get(handle)) return { error: "That link is taken." };

  const userId = tx(() => {
    const u = d
      .prepare("INSERT INTO users (email, password_hash, name, handle, created_at) VALUES (?,?,?,?,?)")
      .run(email, hashPassword(password), name, handle, now());
    const id = Number(u.lastInsertRowid);
    const ref = String(form.get("ref") || "").toUpperCase().slice(0, 16);
    const referrer = ref ? (d.prepare("SELECT id FROM users WHERE referral_code = ?").get(ref) as { id: number } | undefined) : undefined;
    if (referrer) d.prepare("UPDATE users SET referred_by = ? WHERE id = ?").run(referrer.id, id);
    const c = d.prepare("INSERT INTO collections (user_id, name, created_at) VALUES (?,?,?)").run(id, "Inbox", now());
    d.prepare("UPDATE users SET active_collection_id = ? WHERE id = ?").run(Number(c.lastInsertRowid), id);
    return id;
  });
  await createSession(userId);
  redirect("/dashboard/floor?welcome=1");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const row = db().prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email) as
    | { id: number; password_hash: string }
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return { error: "Email or password is incorrect." };
  await createSession(row.id);
  redirect("/dashboard/floor");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
