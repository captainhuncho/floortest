import type { SignalKind } from "@/lib/ops-signals";

/**
 * The new Moderation's plain rules (admin redesign B, step 4; switch `ops_shell`): no React, no server, so
 * tests/ops-moderation.test.ts can run them. The queue lists only tracks with a real signal (src/lib/ops-signals.ts).
 */

/** One row on the left. `kind` is null only for a search result with no signal. */
export type QueueRow = {
  key: string;
  kind: SignalKind | null;
  /** The track to look at; null for a held upload, which isn't a track yet. */
  track_id: number | null;
  title: string;
  artist: string;
  /** The receiver's handle, without the @. */
  receiver: string;
  sender: string;
  email: string;
  /** The receipt token, so a search by token finds it. */
  token: string;
  /** "25 min", worded on the server so the first paint and the page agree. */
  age: string;
  /** The signal in a few words, for the row and the banner's first line. */
  words: string;
  /** The banner's second line. */
  detail: string;
  /** "@max" once someone kept it, for search results. */
  reviewedBy: string | null;
};

export type Filter = "all" | SignalKind;
export const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "takedown", label: "Takedown" },
  { id: "blocked_sender", label: "Blocked" },
  { id: "late_scan", label: "Scanner" },
];

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The signal in words: a short line for the row and banner, and a sentence under it. */
export function signalWords(s: { kind: SignalKind | null; who: string; count: number; handle: string }): { words: string; detail: string } {
  switch (s.kind) {
    case "takedown":
      return { words: `Takedown claim by ${s.who}`, detail: "An open claim on this track. Listen, then keep it or remove it." };
    case "blocked_sender":
      return { words: `Blocked by ${plural(s.count, "receiver")}`, detail: `${s.who} is blocked by ${plural(s.count, "receiver")}. This is their newest track still up.` };
    case "late_scan":
      return { words: "Scanner checked it late", detail: `Still waiting for its virus check, from ${s.who} to @${s.handle}. It isn't a track yet: Jobs shows the scanner.` };
    default:
      return { words: "No signals", detail: "Nothing about this track or its sender stands out." };
  }
}

/** "25 min", "3 h", "2 d": how long ago, in the queue's short words. */
export function ageWords(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

/** Staff may listen only to a track with an open takedown claim (src/lib/staff-listen.ts checks it on the server). */
export const playableKind = (kind: SignalKind | null) => kind === "takedown";

/** Whether a typed query matches a row: title, artist, sender name or email, or the receipt token. */
export function matches(row: QueueRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.title, row.artist, row.sender, row.email].some((v) => v.toLowerCase().includes(q)) || row.token.toLowerCase() === q;
}

/** The rows a filter and a query leave, in the queue's order (newest first). */
export function visibleRows(rows: readonly QueueRow[], filter: Filter, query: string) {
  return rows.filter((r) => (filter === "all" || r.kind === filter) && matches(r, query));
}

/** Each filter tab's count, after the query: All counts every row, the others their own signal. */
export function filterCounts(rows: readonly QueueRow[], query: string): Record<Filter, number> {
  const counts: Record<Filter, number> = { all: 0, takedown: 0, blocked_sender: 0, late_scan: 0 };
  for (const r of rows) {
    if (!matches(r, query)) continue;
    counts.all += 1;
    if (r.kind) counts[r.kind] += 1;
  }
  return counts;
}

/**
 * The row to open after one leaves the list (Keep or Remove): the one below it, or the one above when it was last,
 * or none when it was the only one. `keys` is the list as it was before the row left.
 */
export function nextKeyAfter(keys: readonly string[], gone: string): string | null {
  const i = keys.indexOf(gone);
  if (i < 0) return keys[0] ?? null;
  return keys[i + 1] ?? keys[i - 1] ?? null;
}

/** j / k: the row `step` away from the current one, staying at the ends. With nothing chosen, the first row. */
export function stepKey(keys: readonly string[], current: string | null, step: number): string | null {
  if (!keys.length) return null;
  const i = current ? keys.indexOf(current) : -1;
  if (i < 0) return keys[0];
  return keys[Math.max(0, Math.min(keys.length - 1, i + step))];
}
