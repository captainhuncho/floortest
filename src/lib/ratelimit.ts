import "server-only";
import { headers } from "next/headers";
import { now, q, type Queryable } from "./db";

/** How many events `key` has in `bucket` within the last `windowMs`. */
export async function recentCount(bucket: string, key: string, windowMs: number, db: Queryable = q) {
  const r = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND key = ? AND created_at > ?", bucket, key, now() - windowMs);
  return r?.n ?? 0;
}

export async function record(bucket: string, key: string, db: Queryable = q) {
  await db.run("INSERT INTO rate_events (bucket, key, created_at) VALUES (?,?,?)", bucket, key, now());
}

/**
 * Takes one slot and reports whether the caller is still within `limit` per window. Race-safe: the slot is
 * recorded first, then counted, and handed back if it went over, so requests arriving at the same instant
 * can't all slip under the limit together.
 */
export async function allow(bucket: string, key: string, limit: number, windowMs: number) {
  return (await claim(bucket, key, limit, windowMs)) !== null;
}

/** Like `allow`, but returns the slot's id (0 if the insert returned none) so a caller can hand it back later, or null when over. */
export async function claim(bucket: string, key: string, limit: number, windowMs: number): Promise<number | null> {
  const mine = await q.get<{ id: number }>("INSERT INTO rate_events (bucket, key, created_at) VALUES (?,?,?) RETURNING id", bucket, key, now());
  const n = await recentCount(bucket, key, windowMs);
  if (n <= limit) return mine?.id ?? 0;
  if (mine) await q.run("DELETE FROM rate_events WHERE id = ?", mine.id);
  return null;
}

/** Hands back slots taken with `claim`. */
export async function handBack(...ids: (number | null | undefined)[]) {
  const live = ids.filter((id): id is number => !!id);
  if (live.length) await q.run(`DELETE FROM rate_events WHERE id IN (${live.map(() => "?").join(",")})`, ...live);
}

/**
 * Client IP. Prefers headers set by the hosting platform (which clients can't forge) over the
 * client-appendable X-Forwarded-For.
 */
export function ipFrom(h: Headers) {
  // On Vercel only its own header counts: a client can set the others, which would let it dodge rate limits.
  if (process.env.VERCEL) return (h.get("x-vercel-forwarded-for")?.split(",")[0] || "unknown").trim();
  return (
    h.get("x-vercel-forwarded-for")?.split(",")[0] ||
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0] ||
    "local"
  ).trim();
}

export async function requestIp() {
  return ipFrom(await headers());
}
