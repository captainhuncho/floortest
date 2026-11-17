/**
 * The sender history's grouping and its three chips (All · Listened · Waiting). Pure and import-free, so the page can
 * tag rows on the server and the list can group, date and filter them in the browser with the same code. Nothing here asks
 * the server for anything: it only arranges rows the page has already loaded.
 */

export type SentFilter = "all" | "listened" | "waiting";

export const SENT_FILTERS: { key: SentFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "listened", label: "Listened" },
  { key: "waiting", label: "Waiting" },
];

type Signals = { played_at: number | null; downloaded_at: number | null; replied_at: number | null; played_out_at: number | null };

/** Listened: the receiver has played it. */
export function isListened(r: Pick<Signals, "played_at">) {
  return !!r.played_at;
}

/** Waiting: delivered and nothing after it (no listen, download, reply or play-out), and not past the 90 unheard days. */
export function isWaiting(r: Signals, unheardAfterWindow: boolean) {
  return !unheardAfterWindow && !r.played_at && !r.downloaded_at && !r.replied_at && !r.played_out_at;
}

/** The counts line under the title. Always the totals: it takes every row and knows nothing of the chips. */
export function countsLine(rows: { listened: boolean }[]) {
  if (!rows.length) return "0 tracks sent";
  const heard = rows.filter((r) => r.listened).length;
  return `${rows.length} track${rows.length === 1 ? "" : "s"} sent · ${heard} listened to`;
}

const DAY = 86_400_000;
const WEEK = 7 * DAY;

// One formatter per time zone: a history is up to 300 rows, each read twice (its group and its date).
const FORMATS = new Map<string, Intl.DateTimeFormat>();
/** The calendar date of a moment in a time zone (an IANA name), as the words the labels use. */
function dateIn(ts: number, timeZone: string) {
  let f = FORMATS.get(timeZone);
  if (!f) FORMATS.set(timeZone, (f = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone })));
  const part = Object.fromEntries(f.formatToParts(ts).map((p) => [p.type, p.value]));
  return { weekday: part.weekday, day: part.day, month: part.month, year: part.year };
}

/**
 * "This week" for the last 7 days, then the calendar month it was sent in, with the year when it isn't this year.
 * Months and years are read in `timeZone`: the sender's own (their browser's) in the list, UTC until the browser says.
 */
export function groupLabel(sentAt: number, now: number, timeZone = "UTC") {
  if (now - sentAt < WEEK) return "This week";
  const d = dateIn(sentAt, timeZone);
  return d.year === dateIn(now, timeZone).year ? d.month : `${d.month} ${d.year}`;
}

/** The day a track was sent, as a row shows it: "Mon 16 Nov", with the year when it isn't this year. Same zone rule. */
export function dayLabel(sentAt: number, now: number, timeZone = "UTC") {
  const d = dateIn(sentAt, timeZone);
  const day = `${d.weekday} ${d.day} ${d.month.slice(0, 3)}`;
  return d.year === dateIn(now, timeZone).year ? day : `${day} ${d.year}`;
}

export type SentGroup<T> = { label: string; rows: T[] };

/**
 * Rows (newest first, as loaded) that pass the chip, grouped by when they were sent. A group with no rows left is not
 * returned, so it hides.
 */
export function groupSends<T extends { sentAt: number; listened: boolean; waiting: boolean }>(rows: T[], filter: SentFilter, now: number, timeZone = "UTC"): SentGroup<T>[] {
  const groups: SentGroup<T>[] = [];
  for (const r of rows) {
    if ((filter === "listened" && !r.listened) || (filter === "waiting" && !r.waiting)) continue;
    const label = groupLabel(r.sentAt, now, timeZone);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }
  return groups;
}
