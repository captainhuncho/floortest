import "server-only";
import { atLeast, roleOn } from "./account-members";
import { asPerson, q, type User } from "./db";

/**
 * Analytics (owner, 16 Nov): only what happens on the desk and what the links it shares record. Nothing new is collected:
 * every number comes from the desk's own tracks, senders, callouts and shared-collection links. The page is for the owner
 * and A&R / Admins (requireRole("admin") on the page); every read here is scoped to the desk.
 */

/** Most rows read for one chart. A desk's tracks are bounded by its plan, so this is only a backstop. */
const MAX_TRACK_ROWS = 50_000;
const MAX_LINKS = 500;

/** The periods, in the order the picker shows them. The address carries only the key; anything else means 30d. */
export const PERIODS = [
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["90d", "Last 3 months"],
  ["year", "This year"],
  ["all", "Lifetime"],
] as const;
export type PeriodKey = (typeof PERIODS)[number][0];
export const pickPeriod = (s: string | undefined): PeriodKey => PERIODS.find(([k]) => k === s)?.[0] ?? "30d";

/** The signed-in desk: the account (id) and the person signed in to it (actor_id). Build it with analyticsDesk. */
export type Desk = Pick<User, "id" | "actor_id"> & { tz: string };
/** Each helper re-reads the person's role on the account from the database, so a Member never gets numbers. */
async function deskOf(desk: Desk) {
  const role = await roleOn(desk.id, desk.actor_id);
  if (!role || !atLeast(role, "admin")) throw new Error("Analytics is for the owner and A&R / Admins.");
  return desk;
}

/** The one way to make a Desk: from the signed-in User, with the time zone checked once (bad reads as UTC). */
export function analyticsDesk(user: User, tz: string | null | undefined): Desk {
  return { id: user.id, actor_id: user.actor_id, tz: safeTz(tz) };
}

/** A time zone the browser and server both know; anything else (a bad value stored on the account) reads as UTC. */
export function safeTz(tz: string | null | undefined) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz || "UTC" });
    return tz || "UTC";
  } catch {
    return "UTC";
  }
}
export type Range = {
  period: PeriodKey;
  /** Chart bars: days for 7 and 30 days, weeks for 3 months, months for This year and Lifetime. */
  bucket: "day" | "week" | "month";
  from: number;
  to: number;
  /** The span compared against: the period before, or for This year the same span last year; none for Lifetime. */
  prev: { from: number; to: number } | null;
  /** The desk's calendar day for "now", YYYY-MM-DD. */
  today: string;
  tz: string;
};
export type Totals = { in: number; senders: number; kept: number; passed: number; downloaded: number; playedOut: number };
export type Bar = Totals & { key: string; label: string };

// ---- Calendar days in the desk's time zone ----

const dayFmt = new Map<string, Intl.DateTimeFormat>();
/** The desk's calendar day of a moment, as YYYY-MM-DD. */
export function dayKey(t: number, tz: string) {
  let f = dayFmt.get(tz);
  if (!f) dayFmt.set(tz, (f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })));
  return f.format(t);
}
/** How far the time zone is ahead of UTC at a moment, in ms. */
function offsetAt(tz: string, t: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(t)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
/** The moment a calendar day (YYYY-MM-DD) starts in the time zone. */
export function dayStart(key: string, tz: string) {
  const [y, m, d] = key.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  return utc - offsetAt(tz, utc - offsetAt(tz, utc));
}
const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** The Monday that starts a day's week, YYYY-MM-DD. */
const weekOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return addDays(key, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (key: string) => `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;

/** The span for a period, ending now, in the desk's calendar. */
export function periodRange(key: string | undefined, rawTz: string, now = Date.now()): Range {
  const period = pickPeriod(key);
  const tz = safeTz(rawTz);
  const today = dayKey(now, tz);
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 0;
  if (days) {
    const from = dayStart(addDays(today, -(days - 1)), tz);
    return { period, bucket: period === "90d" ? "week" : "day", from, to: now, prev: { from: dayStart(addDays(today, -(2 * days - 1)), tz), to: from }, today, tz };
  }
  if (period === "year") {
    const year = Number(today.slice(0, 4));
    const from = dayStart(`${year}-01-01`, tz);
    const lastYearSameDay = `${year - 1}${today.slice(4) === "-02-29" ? "-02-28" : today.slice(4)}`;
    const prevFrom = dayStart(`${year - 1}-01-01`, tz);
    return { period, bucket: "month", from, to: now, prev: { from: prevFrom, to: dayStart(lastYearSameDay, tz) + (now - dayStart(today, tz)) }, today, tz };
  }
  return { period, bucket: "month", from: 0, to: now, prev: null, today, tz };
}

const zero = (): Totals => ({ in: 0, senders: 0, kept: 0, passed: 0, downloaded: 0, playedOut: 0 });
const within = (t: number | null, from: number, to: number): t is number => t !== null && t >= from && t < to;

/**
 * The chart and the totals: tracks in, distinct senders, kept, not for me, downloaded and played out, per bar, with the
 * same totals for the span compared against. Read from the desk's tracks (deleted tracks keep their row, so Lifetime never
 * shrinks). Both played out and downloaded come back; the screen shows the one the desk type uses.
 */
export async function perDay(d: Desk, range: Range): Promise<{ bars: Bar[]; totals: Totals; prev: Totals | null; truncated: boolean }> {
  const desk = await deskOf(d);
  const since = range.prev ? range.prev.from : range.from;
  const rows = await asPerson(desk.actor_id, () =>
    q.all<{ sender_id: number; created_at: number; decision: string | null; decided_at: number | null; downloaded_at: number | null; played_out_at: number | null }>(
      `SELECT sender_id, created_at, decision, decided_at, downloaded_at, played_out_at FROM tracks
       WHERE user_id = ? AND (created_at >= ? OR decided_at >= ? OR downloaded_at >= ? OR played_out_at >= ?)
       ORDER BY created_at DESC LIMIT ?`,
      desk.id, since, since, since, since, MAX_TRACK_ROWS,
    ),
  );
  const num = (v: number | null) => (v === null ? null : Number(v));
  // Newest first, so a very big desk loses its oldest rows (and says so), never this week's. Then oldest first again.
  const truncated = rows.length >= MAX_TRACK_ROWS;
  const tracks = rows.reverse().map((r) => ({ sender: Number(r.sender_id), created: Number(r.created_at), decision: r.decision, decided: num(r.decided_at), downloaded: num(r.downloaded_at), playedOut: num(r.played_out_at) }));

  const barKey = (t: number) => {
    const k = dayKey(t, range.tz);
    return range.bucket === "day" ? k : range.bucket === "week" ? weekOf(k) : k.slice(0, 7);
  };
  // Every bar in the span, empty ones too, oldest first. Lifetime starts at the desk's first track.
  const firstDay = range.from ? dayKey(range.from, range.tz) : tracks.length ? dayKey(tracks[0].created, range.tz) : range.today;
  const keys: string[] = [];
  for (let d = firstDay; d <= range.today; d = addDays(d, 1)) {
    const k = range.bucket === "day" ? d : range.bucket === "week" ? weekOf(d) : d.slice(0, 7);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  const bars = new Map<string, Totals & { who: Set<number> }>(keys.map((k) => [k, { ...zero(), who: new Set<number>() }]));

  const tally = (from: number, to: number, add: (t: number, field: keyof Totals, sender?: number) => void) => {
    for (const t of tracks) {
      if (within(t.created, from, to)) add(t.created, "in", t.sender);
      if (within(t.decided, from, to) && t.decision === "kept") add(t.decided, "kept");
      if (within(t.decided, from, to) && t.decision === "passed") add(t.decided, "passed");
      if (within(t.downloaded, from, to)) add(t.downloaded, "downloaded");
      if (within(t.playedOut, from, to)) add(t.playedOut, "playedOut");
    }
  };
  const sum = (from: number, to: number) => {
    const out = zero();
    const who = new Set<number>();
    tally(from, to, (_, field, sender) => {
      out[field]++;
      if (sender !== undefined) who.add(sender);
    });
    return { ...out, senders: who.size };
  };
  tally(range.from, range.to, (t, field, sender) => {
    const bar = bars.get(barKey(t));
    if (!bar) return;
    bar[field]++;
    if (sender !== undefined) bar.who.add(sender);
  });

  const label = (k: string) => (range.bucket === "month" ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : range.bucket === "week" ? `w/c ${short(k)}` : short(k));
  return {
    bars: keys.map((k) => {
      const { who, ...b } = bars.get(k)!;
      return { key: k, label: label(k), ...b, senders: who.size };
    }),
    totals: sum(range.from, range.to),
    prev: range.prev ? sum(range.prev.from, range.prev.to) : null,
    truncated,
  };
}

/** Who sent what in the span: each sender's name, tracks sent and kept, most tracks first. Names only, never emails. */
export async function whoSent(d: Desk, range: Range, limit = 10) {
  const desk = await deskOf(d);
  const cap = Number.isFinite(limit) ? Math.min(Math.max(1, Math.floor(limit)), 200) : 10;
  return asPerson(desk.actor_id, async () => {
    const [rows, total] = await Promise.all([
      q.all<{ name: string; tracks: number; kept: number }>(
        `SELECT s.name, COUNT(*)::int AS tracks, COUNT(*) FILTER (WHERE t.decision = 'kept')::int AS kept
         FROM tracks t JOIN senders s ON s.id = t.sender_id
         WHERE t.user_id = ? AND t.created_at >= ? AND t.created_at < ?
         GROUP BY s.id, s.name ORDER BY tracks DESC, kept DESC, s.name LIMIT ?`,
        desk.id, range.from, range.to, cap,
      ),
      q.count("SELECT COUNT(DISTINCT sender_id) AS n FROM tracks WHERE user_id = ? AND created_at >= ? AND created_at < ?", desk.id, range.from, range.to),
    ]);
    return { rows: rows.map((r) => ({ name: r.name, tracks: Number(r.tracks), kept: Number(r.kept) })), total };
  });
}

/** Each callout that got tracks in the span: its name, tracks sent in and how many different senders, busiest first. */
export async function calloutLinks(d: Desk, range: Range) {
  const desk = await deskOf(d);
  const rows = await asPerson(desk.actor_id, () =>
    q.all<{ id: number; name: string; tracks: number; senders: number }>(
      `SELECT c.id, c.name, COUNT(t.id)::int AS tracks, COUNT(DISTINCT t.sender_id)::int AS senders
       FROM collections c JOIN tracks t ON t.collection_id = c.id AND t.user_id = c.user_id
       WHERE c.user_id = ? AND t.created_at >= ? AND t.created_at < ?
       GROUP BY c.id, c.name ORDER BY tracks DESC, c.name LIMIT 100`,
      desk.id, range.from, range.to,
    ),
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name, tracks: Number(r.tracks), senders: Number(r.senders) }));
}

/**
 * Shared collections, per person, in the span: who opened them (signed-in visits), how many tracks each played and how many
 * downloads. Privacy covers this: "The collection owner sees who opened their collection and what each person played and
 * downloaded." Someone with a FloorTest account shows as their @username (never the account's email); someone without one,
 * as the email the link was shared with. An account being deleted shows as "Removed" (also for visits made before
 * sign-in that carry its email). Erased people are gone: account deletion (share-links.ts forgetLinkPerson) and the
 * email erase (privacy.ts eraseSender, via forgetLinkEmail) delete their visits and plays. Rows are grouped per person
 * (account id, else email), so two people shown the same way (two Removed) stay apart. Single-track
 * shares aren't counted: that feature retired on 1 Oct and its tables (track_shares, share_access) were dropped (6f36fbcf).
 */
/** How a share recipient is named: "Removed" while their account is being deleted, @username with an account, else the email. */
const WHO = (email: string) =>
  `CASE WHEN u.deletion_requested_at IS NOT NULL OR g.deletion_requested_at IS NOT NULL THEN 'Removed' WHEN u.handle IS NOT NULL THEN '@' || u.handle ELSE ${email} END`;
/** The account a row belongs to: its user_id, or (a visit made before sign-in) the account with that email. */
const ACCOUNT = (t: string) => `LEFT JOIN users u ON u.id = ${t}.user_id LEFT JOIN users g ON ${t}.user_id IS NULL AND lower(g.email) = lower(${t}.email)`;
const PERSON = (t: string) => `COALESCE(${t}.user_id, g.id)::text`;

export async function sharedLinks(d: Desk, range: Range) {
  const desk = await deskOf(d);
  // The desk's links, found under the per-person rules; their visits and events are then read only for those links.
  const links = await asPerson(desk.actor_id, () =>
    q.all<{ id: number }>("SELECT l.id FROM collection_links l JOIN collections c ON c.id = l.collection_id WHERE c.user_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT ?", desk.id, MAX_LINKS + 1),
  );
  if (!links.length) return { rows: [], truncated: false };
  // Newest links first; past MAX_LINKS the oldest are left out and the page says so.
  const truncated = links.length > MAX_LINKS;
  const ids = links.slice(0, MAX_LINKS).map((l) => Number(l.id));
  const marks = ids.map(() => "?").join(",");
  const rows = await q.all<{ who: string; opened: number; played: number; downloaded: number }>(
    `WITH ev AS (
       SELECT COALESCE(${PERSON("s")}, lower(s.email)) AS person, ${WHO("s.email")} AS who, 'open' AS kind, NULL::bigint AS track_id
       FROM link_sessions s ${ACCOUNT("s")}
       WHERE s.link_id IN (${marks}) AND s.created_at >= ? AND s.created_at < ?
       UNION ALL
       SELECT COALESCE(${PERSON("e")}, lower(e.email)) AS person, ${WHO("e.email")} AS who, e.kind, e.track_id
       FROM link_events e ${ACCOUNT("e")}
       WHERE e.link_id IN (${marks}) AND e.kind IN ('listened', 'downloaded') AND e.created_at >= ? AND e.created_at < ?
     )
     SELECT MIN(who) AS who, COUNT(*) FILTER (WHERE kind = 'open')::int AS opened,
       COUNT(DISTINCT track_id) FILTER (WHERE kind = 'listened')::int AS played,
       COUNT(*) FILTER (WHERE kind = 'downloaded')::int AS downloaded
     FROM ev WHERE person IS NOT NULL AND who IS NOT NULL GROUP BY person ORDER BY opened DESC, played DESC, MIN(who) LIMIT 100`,
    ...ids, range.from, range.to, ...ids, range.from, range.to,
  );
  return { rows: rows.map((r) => ({ who: r.who, opened: Number(r.opened), played: Number(r.played), downloaded: Number(r.downloaded) })), truncated };
}
