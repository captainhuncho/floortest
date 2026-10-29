import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { now, q, USER_COLUMNS, type User } from "./db";
import { env, isProd } from "./env";

/** Same hashing as main sessions (kept local so auth.ts can import this file). */
const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/**
 * The admin area's own sign-in, separate from the main site's: its own cookie, only ever sent to the ops host
 * (host-only, strict), and short-lived. Being signed in on floortest.app grants nothing here, and the other way round.
 */
const COOKIE = isProd ? "__Host-ft_ops" : "ft_ops";
/** An ops session nobody has used for this long ends (owner's rule: staff and admin about 30 minutes idle). */
export const OPS_IDLE_MS = 30 * 60_000;
const IDLE_MS = OPS_IDLE_MS;
/** And it ends this long after sign-in, used or not. */
export const OPS_MAX_MS = 8 * 60 * 60_000;
const MAX_MS = OPS_MAX_MS;

export const OPS_URL = env.opsUrl;

export async function createOpsSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const t = now();
  await q.run("DELETE FROM admin_sessions WHERE expires_at < ? OR last_seen_at < ?", t, t - IDLE_MS);
  await q.run("INSERT INTO admin_sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)", hashToken(token), userId, t, t, t + MAX_MS);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: isProd, sameSite: "strict", path: "/", maxAge: MAX_MS / 1000 });
}

export async function destroyOpsSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q.run("DELETE FROM admin_sessions WHERE token_hash = ?", hashToken(token));
  jar.delete(COOKIE);
}

/** The admin signed in on ops, if the session is live (used in the last 30 minutes, under 8 hours old). Memoised per request. */
export const currentOpsAdmin = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const t = now();
  const cols = USER_COLUMNS.split(", ").map((c) => `u.${c}`).join(", ");
  const row = await q.get<User & { last_seen_at: number }>(
    `SELECT ${cols}, s.last_seen_at FROM admin_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND s.last_seen_at > ? AND u.suspended_at IS NULL`,
    hashToken(token), t, t - IDLE_MS,
  );
  if (!row) return null;
  // Keep the idle clock honest without writing on every request.
  if (t - Number(row.last_seen_at) > 60_000) await q.run("UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?", t, hashToken(token));
  const user: Partial<typeof row> = { ...row };
  delete user.last_seen_at;
  return user as unknown as User;
});

/** The current ops session's token hash (ops host only), for binding a preview to this exact session. */
export async function currentOpsSessionHash() {
  const token = (await cookies()).get(COOKIE)?.value;
  return token && (await currentOpsAdmin()) ? hashToken(token) : null;
}

/** Whether that exact ops session (by token hash) is still live and belongs to `userId`. */
export async function opsSessionLive(session: string, userId: number) {
  const t = now();
  return !!(await q.get(
    "SELECT 1 FROM admin_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.user_id = ? AND s.expires_at > ? AND s.last_seen_at > ? AND u.suspended_at IS NULL",
    session, userId, t, t - IDLE_MS,
  ));
}

/**
 * A single-use, 60-second ticket that carries an admin from ops to the main site to view a desk read-only. It records
 * the exact ops session that asked, so the view lives and dies with that session.
 */
export async function issueViewTicket(adminId: number, userId: number) {
  const session = await currentOpsSessionHash();
  if (!session) throw new Error("No live ops session.");
  const token = crypto.randomBytes(32).toString("base64url");
  await q.run("DELETE FROM view_tickets WHERE expires_at < ?", now());
  await q.run("INSERT INTO view_tickets (token_hash, admin_id, user_id, expires_at, session_hash) VALUES (?,?,?,?,?)", hashToken(token), adminId, userId, now() + 60_000, session);
  return token;
}

export async function redeemViewTicket(token: string) {
  const row = await q.get<{ admin_id: number; user_id: number; session_hash: string }>(
    "DELETE FROM view_tickets WHERE token_hash = ? AND expires_at > ? RETURNING admin_id, user_id, session_hash",
    hashToken(String(token).slice(0, 100)), now(),
  );
  return row ?? null;
}
