import { RETAIN_UNREVIEWED_DAYS } from "./plans";

const DAY = 86_400_000;

/** Days a receipt link stays open after the track's final outcome (owner, 4 Nov: "go 90"). */
export const RECEIPT_CLOSE_DAYS = 90;

/** The track facts the receipt's life is read from. Server only: the decision never reaches the page. */
export type LifeFacts = {
  created_at: number;
  played_out_at: number | null;
  decision: string | null;
  decided_at: number | null;
  deleted_at: number | null;
};

/** Open: everything works. Read-only: the record shows, nothing can be done. Closed: the link shows only that. */
export type ReceiptLife = "open" | "read-only" | "closed";

/**
 * When the track reached its final outcome, as far as the receipt may know (owner, 4 Nov, "Backend's way"):
 * - Played out: at once. The sender already sees it on the receipt.
 * - Silent outcomes (Not for me, deleted by the receiver, removed by retention, or undecided and due for removal):
 *   never before upload + 90 days, the day an untouched track leaves anyway. So a "Not for me" on day 2 and a track
 *   nobody opened look the same: read-only from day 90, closed from day 180. The receipt never gives a decision away.
 * - Kept, with nothing after: no outcome yet, the link stays live.
 * Null when there is no outcome yet.
 */
export function finalAt(t: LifeFacts): number | null {
  const floor = t.created_at + RETAIN_UNREVIEWED_DAYS * DAY;
  const passedAt = t.decision === "passed" ? (t.decided_at ?? t.created_at) : null;
  // The earliest silent event: a pass counts from the pass, not from its file's later removal (a pass on day 80 would
  // otherwise close later than an untouched track).
  const silent = [t.deleted_at, passedAt].filter((x): x is number => x != null);
  const times: number[] = [];
  if (t.played_out_at) times.push(t.played_out_at);
  if (silent.length) times.push(Math.max(Math.min(...silent), floor));
  // Undecided: removed by retention at the floor, so that is its outcome too (whether or not the nightly job has run).
  else if (t.decision == null) times.push(floor);
  return times.length ? Math.min(...times) : null;
}

/** The receipt's state at `now`. */
export function receiptLife(t: LifeFacts, now = Date.now()): ReceiptLife {
  const at = finalAt(t);
  if (at == null || now < at) return "open";
  return now < at + RECEIPT_CLOSE_DAYS * DAY ? "read-only" : "closed";
}

/** When the receipt link closes, if the track has an outcome. */
export function receiptClosesAt(t: LifeFacts) {
  const at = finalAt(t);
  return at == null ? null : at + RECEIPT_CLOSE_DAYS * DAY;
}
