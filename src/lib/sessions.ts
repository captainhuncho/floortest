import "server-only";
import crypto from "node:crypto";
import { now, q, type Queryable } from "./db";
import { env } from "./env";

/**
 * The browser session cookie. On the live site it carries the `__Host-` prefix: the browser then sends it only over
 * HTTPS, only to this exact host, and no subdomain can set or overwrite it. Locally it has the plain name.
 */
export const sessionCookie = (prod: boolean) => (prod ? "__Host-floortest_session" : "floortest_session");
/** The live site's name before 15 Oct 2026. Still read (never written) until OLD_COOKIE_UNTIL, so the rename signed nobody out. */
export const OLD_SESSION_COOKIE = "floortest_session";
/**
 * After this the old name is ignored. The rename went live on 15 Oct 2026 (about 02:40 UTC) and a browser session
 * lasts at most 30 days from sign-in, so every session issued under the old name has expired by 14 Nov; one more day
 * of margin. After this date the fallback can be deleted outright.
 */
export const OLD_COOKIE_UNTIL = Date.UTC(2026, 10, 15);

/** The session token a browser sent: the current cookie, or (on the live site, until the cut-off) the old one. */
export function readSessionToken(jar: { get(name: string): { value: string } | undefined }, prod: boolean, at = now()) {
  const name = sessionCookie(prod);
  const current = jar.get(name)?.value;
  if (current || name === OLD_SESSION_COOKIE || at >= OLD_COOKIE_UNTIL) return current;
  return jar.get(OLD_SESSION_COOKIE)?.value;
}

/**
 * Ends every way into the account after its password changes or is reset: every browser and app session (except
 * `keep`, the browser doing the change, when given), every ops (admin area) session, and any reset link not yet used,
 * so an old emailed link can't set the password again. Pass `db` to run inside the caller's transaction.
 */
export async function revokeAllSessions(userId: number, o: { keep?: string | null; db?: Queryable } = {}) {
  const db = o.db ?? q;
  const ended = await db.run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", userId, o.keep ?? "");
  const ops = await db.run("DELETE FROM admin_sessions WHERE user_id = ?", userId);
  await db.run("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL", now(), userId);
  return ended.changes + ops.changes;
}

/** A browser session nobody has used for this long ends, even inside its 30 days. App sessions refresh themselves and are exempt. */
export const WEB_IDLE_MS = 14 * 86_400_000;
/** "Last seen" is written at most this often, so an open desk doesn't write on every request. */
export const TOUCH_EVERY_MS = 3_600_000;

export type SessionRow = { id: string; kind: "web" | "app"; device: string; createdAt: number; lastSeenAt: number | null; current: boolean };

/**
 * The id the Security page uses for a session: keyed with the app secret, so the page never holds the session's
 * lookup key (the token hash, which app access tokens also carry).
 */
export const deviceId = (tokenHash: string) => crypto.createHmac("sha256", env.secret).update(`device:${tokenHash}`).digest("hex").slice(0, 32);

/** Every live session of an account, most recently seen first: the devices list on the Security page. */
export async function listSessions(userId: number, currentHash: string | null, at = now()): Promise<SessionRow[]> {
  const rows = await q.all<{ token_hash: string; kind: "web" | "app"; device: string; label: string; created_at: number; last_seen_at: number | null }>(
    `SELECT token_hash, kind, device, label, created_at, last_seen_at FROM sessions
     WHERE user_id = ? AND expires_at > ? AND (kind <> 'web' OR COALESCE(last_seen_at, created_at) > ?)
     ORDER BY COALESCE(last_seen_at, created_at) DESC`,
    userId,
    at,
    at - WEB_IDLE_MS,
  );
  return rows.map((r) => ({
    id: deviceId(r.token_hash),
    kind: r.kind,
    device: r.kind === "app" ? r.label || "FloorTest app" : r.device || "A browser",
    createdAt: Number(r.created_at),
    lastSeenAt: r.last_seen_at == null ? null : Number(r.last_seen_at),
    current: r.token_hash === currentHash,
  }));
}

/** Ends one of the account's own sessions, by its id on the devices list (`deviceId`). True if it was live. */
export async function endSession(userId: number, id: string) {
  const rows = await q.all<{ token_hash: string }>("SELECT token_hash FROM sessions WHERE user_id = ?", userId);
  const hash = rows.find((r) => deviceId(r.token_hash) === id)?.token_hash;
  return !!hash && (await q.run("DELETE FROM sessions WHERE user_id = ? AND token_hash = ?", userId, hash)).changes > 0;
}

/** Records that a session was just used, at most once an hour. True when it wrote. */
export async function touchSession(hash: string, lastSeenAt: number | null, at = now()) {
  if (lastSeenAt != null && at - lastSeenAt < TOUCH_EVERY_MS) return false;
  await q.run("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?", at, hash);
  return true;
}
