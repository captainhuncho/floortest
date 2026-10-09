import { after } from "next/server";
import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { now, q, USER_COLUMNS, type User } from "./db";
import { env, isProd } from "./env";
import { opsSessionLive } from "./ops";
import { GATE_COOKIE, GATE_DAYS, gatePassword, gateToken } from "./site-gate";

const COOKIE = "floortest_session";
const SESSION_MS = 1000 * 60 * 60 * 24 * 30;
const RESET_MS = 1000 * 60 * 60;

/** Tokens are stored hashed, so a database leak doesn't hand out live sessions or reset links. */
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, Buffer.from(salt, "hex"), 64);
  const want = Buffer.from(hash, "hex");
  return test.length === want.length && crypto.timingSafeEqual(test, want);
}

export async function createSession(userId: number) {
  const token = newToken();
  const expires = now() + SESSION_MS;
  await q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)", hashToken(token), userId, expires, now());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: new Date(expires),
  });
  // While the site is behind the coming-soon gate, a real sign-in lets that browser through it.
  if (gatePassword())
    (await cookies()).set(GATE_COOKIE, gateToken(), { httpOnly: true, sameSite: "lax", secure: isProd, path: "/", maxAge: GATE_DAYS * 86_400 });
}

/** Hash of this browser's session token, or null when signed out. */
export async function currentSessionHash() {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? hashToken(token) : null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q.run("DELETE FROM sessions WHERE token_hash = ?", hashToken(token));
  jar.delete(COOKIE);
}

export const VIEW_AS_COOKIE = "floortest_view_as";

/** Signed "admin X, from ops session S, is viewing user Y until T" ticket, readable only on /dashboard pages. */
export function signViewAs(adminId: number, userId: number, session: string, secret: string, ttlMs = 30 * 60_000) {
  const body = `${adminId}.${userId}.${session}.${Date.now() + ttlMs}`;
  return `${body}.${crypto.createHmac("sha256", secret).update(`viewas:${body}`).digest("base64url")}`;
}

function readViewAs(token: string | undefined, secret: string) {
  if (!token) return null;
  const [a, u, s, exp, mac] = token.split(".");
  if (!a || !u || !/^[a-f0-9]{64}$/.test(s ?? "") || !exp || !mac) return null;
  const want = crypto.createHmac("sha256", secret).update(`viewas:${a}.${u}.${s}.${exp}`).digest("base64url");
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac)) || Number(exp) < Date.now()) return null;
  return { adminId: Number(a), userId: Number(u), session: s };
}

/** When an admin is viewing someone's desk: who they're viewing. Null otherwise. */
export const viewingAs = cache(async (): Promise<{ adminId: number; userId: number; handle: string } | null> => {
  const jar = await cookies();
  const va = readViewAs(jar.get(VIEW_AS_COOKIE)?.value, env.secret);
  if (!va) return null;
  // That admin must still qualify (admin list, confirmed email, two-factor), and the exact ops session that opened
  // the view must still be live: signing out of ops ends it.
  const admin = await q.get<{ email: string; totp_enabled_at: number | null; email_verified_at: number | null }>(
    "SELECT email, totp_enabled_at, email_verified_at FROM users WHERE id = ? AND suspended_at IS NULL",
    va.adminId,
  );
  if (!admin || !admin.totp_enabled_at || !admin.email_verified_at || !env.adminEmails.includes(admin.email.toLowerCase())) return null;
  if (!(await opsSessionLive(va.session, va.adminId))) return null;
  const target = await q.get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", va.userId);
  return target ? { adminId: va.adminId, userId: va.userId, handle: target.handle } : null;
});

/** The signed-in user, memoised per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const view = await viewingAs();
  if (view) {
    // Read-only: a server action (anything that changes data) acts as nobody while viewing.
    if ((await headers()).get("next-action")) return null;
    const cols = USER_COLUMNS;
    return (await q.get<User>(`SELECT ${cols} FROM users WHERE id = ?`, view.userId)) ?? null;
  }
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const cols = USER_COLUMNS.split(", ").map((c) => `u.${c}`).join(", ");
  const row = await q.get<User & { last_active_at?: number | null }>(
    `SELECT ${cols}, u.last_active_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.suspended_at IS NULL`,
    hashToken(token),
    now(),
  );
  if (!row) return null;
  // "Last active" for the admin's beta tracker: written at most once an hour, after the response is sent.
  const last = row.last_active_at;
  delete row.last_active_at;
  if (!last || now() - last > 3_600_000) after(() => q.run("UPDATE users SET last_active_at = ? WHERE id = ?", now(), row.id).catch(() => {}));
  return row;
});

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  // In a read-only admin view, a blocked change goes back to the desk, not to the login page.
  if (!u && (await viewingAs())) redirect("/dashboard/floor?readonly=1");
  if (!u) redirect("/login");
  return u;
}

/** A one-hour, single-use reset link. Returns the raw token, which is only ever emailed. */
export async function createPasswordReset(userId: number) {
  const token = newToken();
  await q.run("INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)", hashToken(token), userId, now() + RESET_MS, now());
  return token;
}

export async function findPasswordReset(token: string) {
  return q.get<{ user_id: number }>(
    "SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
    hashToken(token),
    now(),
  );
}

/** Sets the new password and signs the account out everywhere. Returns the user id, or null if the link is no good. */
export async function consumePasswordReset(token: string, newPassword: string) {
  return q.tx(async (db) => {
    const r = await db.get<{ user_id: number }>(
      "UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id",
      now(),
      hashToken(token),
      now(),
    );
    if (!r) return null;
    await db.run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(newPassword), r.user_id);
    await db.run("DELETE FROM sessions WHERE user_id = ?", r.user_id);
    return r.user_id;
  });
}
