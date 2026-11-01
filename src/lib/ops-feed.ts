import "server-only";
import { q } from "@/lib/db";
import { can, type OpsAccess } from "@/lib/ops-access";
import type { Need } from "@/lib/ops-perms";

/**
 * Ops shell → live feed (ops redesign B, 1 Nov): the Overview's recent activity, kept current by GET /api/admin/feed.
 * Sign-ups, first tracks, takedown claims and admin actions (never ops sign-ins). One read serves everyone for FEED_TTL_MS
 * (every open ops tab polls), then each viewer gets only what they may open: people's names need users.read, takedowns
 * and the admin log are the super admin's. Each kind is read with named columns and its own LIMIT, so one busy kind
 * can't push out the others.
 */
export const FEED_TTL_MS = 30_000;
export const FEED_LIMIT = 30;

export type FeedKind = "signup" | "first" | "takedown" | "admin";
export type FeedItem = { kind: FeedKind; text: string; ref: string; created_at: number; href: string };

const NEED: Record<FeedKind, Need> = { signup: "users.read", first: "users.read", takedown: "super", admin: "super" };

const HREF = (kind: FeedKind, ref: string) => (kind === "signup" || kind === "first" ? `/admin/accounts/${ref}` : kind === "takedown" ? "/admin/takedowns" : "/admin/log");

let cached: { at: number; rows: FeedItem[] } | null = null;

/** Everything recent, newest first, read at most once per FEED_TTL_MS (per server instance). */
export async function feedRows(now = Date.now()): Promise<FeedItem[]> {
  if (cached && now - cached.at < FEED_TTL_MS && now >= cached.at) return cached.rows;
  const rows = await q.all<{ kind: FeedKind; text: string; ref: string; created_at: number }>(
    `SELECT kind, text, ref, created_at FROM (
       (SELECT 'signup' AS kind, name || ' @' || handle AS text, CAST(id AS text) AS ref, created_at FROM users ORDER BY created_at DESC LIMIT ${FEED_LIMIT})
       UNION ALL (SELECT 'takedown', 'Takedown claim received', CAST(id AS text), created_at FROM takedowns ORDER BY created_at DESC LIMIT ${FEED_LIMIT})
       UNION ALL (SELECT 'first', u.name || ' received their first track', CAST(u.id AS text), f.at FROM users u
                    JOIN (SELECT user_id, MIN(created_at) AS at FROM tracks GROUP BY user_id) f ON f.user_id = u.id ORDER BY f.at DESC LIMIT ${FEED_LIMIT})
       UNION ALL (SELECT 'admin', action || CASE WHEN target <> '' THEN ' · ' || target ELSE '' END, '', created_at FROM admin_log
                   WHERE action NOT IN ('signed in to ops', 'signed out of ops') ORDER BY created_at DESC LIMIT ${FEED_LIMIT})
     ) a ORDER BY created_at DESC`,
  );
  cached = { at: now, rows: rows.map((r) => ({ kind: r.kind, text: r.text, ref: r.ref, created_at: Number(r.created_at), href: HREF(r.kind, r.ref) })) };
  return cached.rows;
}

/** The feed for one viewer: only the kinds they may open, newest first, at most FEED_LIMIT. */
export function feedFor(access: OpsAccess, rows: FeedItem[]): FeedItem[] {
  return rows.filter((r) => can(access, NEED[r.kind])).slice(0, FEED_LIMIT);
}
