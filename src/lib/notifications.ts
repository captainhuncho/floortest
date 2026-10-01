import "server-only";
import { activeCollection, capacity, isClosed, isPaused } from "./core";
import { now, q, type User } from "./db";

export type Notice = { id: string; title: string; detail: string; href: string; at: number; unread: boolean; tone: "info" | "alert" };

const DAY = 86_400_000;
const shortDate = (ts: number, tz: string) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz });

/** New submissions and auto-deletions since the bell was last opened, plus live alerts about the link. */
export async function notificationsFor(user: User) {
  const row = await q.get<{ s: number | null; c: number | null }>("SELECT notifications_seen_at AS s, notifications_cleared_at AS c FROM users WHERE id = ?", user.id);
  const seen = row?.s ?? 0;
  const cleared = row?.c ?? 0;
  const events = await q.all<{ id: number; type: string; track_id: number; created_at: number; title: string; sender: string; collection: string | null }>(
    `SELECT e.id, e.type, e.track_id, e.created_at, t.title, s.name AS sender, c.name AS collection
     FROM events e JOIN senders s ON s.id = e.sender_id LEFT JOIN tracks t ON t.id = e.track_id
     LEFT JOIN collections c ON c.id = t.collection_id
     WHERE e.user_id = ? AND e.created_at > ? AND e.type IN ('submitted', 'expired') ORDER BY e.created_at DESC LIMIT 20`,
    user.id,
    cleared,
  );

  const news = await q.all<{ id: number; title: string; body: string; href: string; created_at: number }>(
    "SELECT id, title, body, href, created_at FROM announcements WHERE created_at > ? AND created_at >= ? AND (audience = 'all' OR audience = ?) ORDER BY created_at DESC LIMIT 5",
    cleared,
    user.created_at,
    user.plan,
  );
  const items: Notice[] = news.map((n) => ({
    id: `a${n.id}`,
    title: n.title,
    detail: n.body,
    href: n.href || "/dashboard",
    at: n.created_at,
    unread: n.created_at > seen,
    tone: "info" as const,
  }));
  items.push(...events.map((e) => ({
    id: `e${e.id}`,
    title: e.type === "submitted" ? `New track: ${e.title}` : `Auto-deleted: ${e.title}`,
    detail: e.type === "submitted" ? `from ${e.sender}${e.collection ? ` · ${e.collection}` : ""}` : "Not kept within the retention period",
    href: e.type === "submitted" ? `/dashboard?view=queue&s=all&t=${e.track_id}` : "/dashboard/activity?f=intake",
    at: e.created_at,
    unread: e.created_at > seen,
    tone: "info" as const,
  })));
  items.sort((a, b) => b.at - a.at);

  // Live alerts: shown while true.
  const alerts: Notice[] = [];
  const c = await activeCollection(user);
  const t = now();
  if (isPaused(user))
    alerts.push({
      id: "paused",
      title: "Submissions are paused",
      detail: user.pause_until ? `Reopens ${shortDate(user.pause_until, user.tz)}` : "Switch them back on in the sidebar.",
      href: "/dashboard/floor",
      at: user.paused_at!,
      unread: false,
      tone: "alert",
    });
  if ((await capacity(user)).full)
    alerts.push({ id: "full", title: "Your desk is full", detail: "Your link has stopped taking uploads.", href: "/dashboard/plans", at: t, unread: true, tone: "alert" });
  if (c && isClosed(c))
    alerts.push({ id: "closed", title: `“${c.name}” is closed`, detail: "Your link isn't taking uploads. Pick an open collection.", href: "/dashboard/collections", at: c.closes_at!, unread: c.closes_at! > seen, tone: "alert" });
  else if (c?.closes_at && c.closes_at - t < 3 * DAY)
    alerts.push({ id: "closing", title: `“${c.name}” closes soon`, detail: `Closes ${shortDate(c.closes_at, user.tz)}`, href: "/dashboard/collections", at: t, unread: t - DAY > seen, tone: "alert" });

  const all = [...alerts, ...items];
  return { items: all, unread: all.filter((n) => n.unread).length };
}
