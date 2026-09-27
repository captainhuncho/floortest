import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { now, q, USER_COLUMNS, type User } from "./db";
import { isProd } from "./env";

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

/** The signed-in user, memoised per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const cols = USER_COLUMNS.split(", ").map((c) => `u.${c}`).join(", ");
  const row = await q.get<User>(
    `SELECT ${cols} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    hashToken(token),
    now(),
  );
  return row ?? null;
});

export async function requireUser(): Promise<User> {
  const u = await currentUser();
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
