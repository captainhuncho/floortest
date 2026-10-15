import "server-only";
import { now, q } from "./db";

/** A browser session nobody has used for this long ends, even inside its 30 days. App sessions refresh themselves and are exempt. */
export const WEB_IDLE_MS = 14 * 86_400_000;
/** "Last seen" is written at most this often, so an open desk doesn't write on every request. */
export const TOUCH_EVERY_MS = 3_600_000;

export type SessionRow = { hash: string; kind: "web" | "app"; device: string; createdAt: number; lastSeenAt: number | null; current: boolean };

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
    hash: r.token_hash,
    kind: r.kind,
    device: r.kind === "app" ? r.label || "FloorTest app" : r.device || "A browser",
    createdAt: Number(r.created_at),
    lastSeenAt: r.last_seen_at == null ? null : Number(r.last_seen_at),
    current: r.token_hash === currentHash,
  }));
}

/** Ends one of the account's own sessions (a device on the list). True if it was live. */
export async function endSession(userId: number, hash: string) {
  return (await q.run("DELETE FROM sessions WHERE user_id = ? AND token_hash = ?", userId, hash)).changes > 0;
}

/** Records that a session was just used, at most once an hour. True when it wrote. */
export async function touchSession(hash: string, lastSeenAt: number | null, at = now()) {
  if (lastSeenAt != null && at - lastSeenAt < TOUCH_EVERY_MS) return false;
  await q.run("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?", at, hash);
  return true;
}
