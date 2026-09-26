import "server-only";
import { db, now } from "./db";

const DAY = 86_400_000;

const count = (sql: string, ...args: (string | number)[]) => (db().prepare(sql).get(...args) as { n: number }).n;

/** Headline numbers for Home. Weeks are rolling 7-day windows. */
export function homeStats(userId: number, tz: string) {
  const t = now();
  const received = (from: number, to: number) =>
    count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND created_at >= ? AND created_at < ?", userId, from, to);
  const kept = (from: number, to: number) =>
    count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND decision = 'kept' AND decided_at >= ? AND decided_at < ?", userId, from, to);

  // Median delivery → first listen over the last 30 days: how quickly senders hear back.
  const waits = (
    db()
      .prepare("SELECT played_at - created_at AS w FROM tracks WHERE user_id = ? AND played_at IS NOT NULL AND created_at >= ? ORDER BY w")
      .all(userId, t - 30 * DAY) as { w: number }[]
  ).map((r) => r.w);
  const median = waits.length ? waits[Math.floor((waits.length - 1) / 2)] : null;

  const recent30 = count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND created_at >= ?", userId, t - 30 * DAY);
  const decided30 = count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND created_at >= ? AND decision IS NOT NULL", userId, t - 30 * DAY);

  return {
    receivedWeek: received(t - 7 * DAY, t),
    receivedPrev: received(t - 14 * DAY, t - 7 * DAY),
    keptWeek: kept(t - 7 * DAY, t),
    keptPrev: kept(t - 14 * DAY, t - 7 * DAY),
    waiting: count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND decision IS NULL", userId),
    medianListenMs: median,
    listenedSample: waits.length,
    decisionRate: recent30 ? Math.round((decided30 / recent30) * 100) : null,
    daily: dailyReceived(userId, tz, 14),
  };
}

/** Tracks received per local calendar day, oldest first, including empty days. */
function dailyReceived(userId: number, tz: string, days: number) {
  const key = (ts: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ts);
  const label = (ts: number) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(ts);
  const t = now();
  const rows = db()
    .prepare("SELECT created_at FROM tracks WHERE user_id = ? AND created_at >= ?")
    .all(userId, t - (days + 1) * DAY) as { created_at: number }[];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(key(r.created_at), (counts.get(key(r.created_at)) ?? 0) + 1);
  return Array.from({ length: days }, (_, i) => {
    const ts = t - (days - 1 - i) * DAY;
    return { day: label(ts), count: counts.get(key(ts)) ?? 0, today: i === days - 1 };
  });
}

/** Genre share of tracks received in the last 30 days: top five plus "Other". */
export function genreMix(userId: number) {
  const rows = db()
    .prepare(
      `SELECT COALESCE(NULLIF(genre, ''), 'Not set') AS genre, COUNT(*) AS n FROM tracks
       WHERE user_id = ? AND created_at >= ? GROUP BY 1 ORDER BY n DESC, genre`,
    )
    .all(userId, now() - 30 * DAY) as { genre: string; n: number }[];
  // Plain objects: these go straight to a client component.
  const top = rows.slice(0, 5).map((r) => ({ genre: r.genre, n: r.n }));
  const rest = rows.slice(5).reduce((s, r) => s + r.n, 0);
  return rest ? [...top, { genre: "Other", n: rest }] : top;
}

export function fmtDuration(ms: number) {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(h < 240 ? 1 : 0)}d`;
}
