import "server-only";
import { now, q } from "./db";

const DAY = 86_400_000;

const count = (sql: string, ...args: (string | number)[]) => q.count(sql, ...args);

/** Headline numbers for Home. Weeks are rolling 7-day windows. */
export async function homeStats(userId: number, tz: string) {
  const t = now();
  const received = (from: number, to: number) =>
    count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND created_at >= ? AND created_at < ?", userId, from, to);
  const kept = (from: number, to: number) =>
    count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND decision = 'kept' AND decided_at >= ? AND decided_at < ?", userId, from, to);

  // All independent, so they go to the database together.
  const [waitRows, recent30, decided30, receivedWeek, receivedPrev, keptWeek, keptPrev, waiting, daily] = await Promise.all([
    // Median delivery → first listen over the last 30 days: how quickly senders hear back.
    q.all<{ w: number }>("SELECT played_at - created_at AS w FROM tracks WHERE user_id = ? AND played_at IS NOT NULL AND created_at >= ? ORDER BY w", userId, t - 30 * DAY),
    count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND created_at >= ?", userId, t - 30 * DAY),
    count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND created_at >= ? AND decision IS NOT NULL", userId, t - 30 * DAY),
    received(t - 7 * DAY, t),
    received(t - 14 * DAY, t - 7 * DAY),
    kept(t - 7 * DAY, t),
    kept(t - 14 * DAY, t - 7 * DAY),
    count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND decision IS NULL", userId),
    dailyReceived(userId, tz, 14),
  ]);
  const waits = waitRows.map((r) => r.w);
  const median = waits.length ? waits[Math.floor((waits.length - 1) / 2)] : null;

  return {
    receivedWeek,
    receivedPrev,
    keptWeek,
    keptPrev,
    waiting,
    medianListenMs: median,
    listenedSample: waits.length,
    decisionRate: recent30 ? Math.round((decided30 / recent30) * 100) : null,
    daily,
  };
}

/** Tracks received, kept and first listened per local calendar day, oldest first, including empty days. */
async function dailyReceived(userId: number, tz: string, days: number) {
  const key = (ts: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ts);
  const label = (ts: number) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(ts);
  const weekday = (ts: number) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short" }).format(ts);
  const t = now();
  const from = t - (days + 1) * DAY;
  const [rows, keptRows, playedRows] = await Promise.all([
    q.all<{ created_at: number }>("SELECT created_at FROM tracks WHERE user_id = ? AND created_at >= ?", userId, from),
    q.all<{ decided_at: number }>("SELECT decided_at FROM tracks WHERE user_id = ? AND decision = 'kept' AND decided_at >= ?", userId, from),
    q.all<{ played_at: number }>("SELECT played_at FROM tracks WHERE user_id = ? AND played_at >= ?", userId, from),
  ]);
  const tally = (list: number[]) => {
    const m = new Map<string, number>();
    for (const ts of list) m.set(key(ts), (m.get(key(ts)) ?? 0) + 1);
    return m;
  };
  const counts = tally(rows.map((r) => Number(r.created_at)));
  const kept = tally(keptRows.map((r) => Number(r.decided_at)));
  const listened = tally(playedRows.map((r) => Number(r.played_at)));
  return Array.from({ length: days }, (_, i) => {
    const ts = t - (days - 1 - i) * DAY;
    return { day: label(ts), weekday: weekday(ts), count: counts.get(key(ts)) ?? 0, kept: kept.get(key(ts)) ?? 0, listened: listened.get(key(ts)) ?? 0, today: i === days - 1 };
  });
}

/** Genre share of tracks received in the last 30 days: top five plus "Other". */
export async function genreMix(userId: number) {
  const rows = await q.all<{ genre: string; n: number }>(
    `SELECT COALESCE(NULLIF(genre, ''), 'Not set') AS genre, COUNT(*) AS n FROM tracks
     WHERE user_id = ? AND created_at >= ? GROUP BY 1 ORDER BY n DESC, 1`,
    userId,
    now() - 30 * DAY,
  );
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
