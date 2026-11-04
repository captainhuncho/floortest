import { RETAIN_UNREVIEWED_DAYS } from "./plans";

const DAY = 86_400_000;

/** Days a receipt link stays open after the track's final outcome (owner, 4 Nov: "go 90"). */
export const RECEIPT_CLOSE_DAYS = 90;

/**
 * The track facts the receipt's life is read from: only what the sender can already see on the receipt. The
 * receiver's decision and the file's removal are never read, so the receipt can't give either away (owner, 4 Nov,
 * "same clock for all, plus the stems hold"; Safety's review of #431).
 */
export type LifeFacts = {
  created_at: number;
  played_out_at: number | null;
  stems_requested_at: number | null;
  stems_sent: string | null;
};

/** Open: everything works. Read-only: the record shows, nothing can be done. Closed: the link shows only that. */
export type ReceiptLife = "open" | "read-only" | "closed";

/**
 * The track's final outcome as the receipt counts it, the same for every track whatever the receiver decided:
 * played out (the sender sees it) or upload + 90 days, whichever comes first.
 */
export function finalAt(t: Pick<LifeFacts, "created_at" | "played_out_at">) {
  const floor = t.created_at + RETAIN_UNREVIEWED_DAYS * DAY;
  return t.played_out_at ? Math.min(t.played_out_at, floor) : floor;
}

/** Whether any stem was sent: the receipt's own list of names (as stems.ts stemsSent reads it; not imported, stems.ts uses this file). */
function anyStemSent(stemsSentJson: string | null) {
  try {
    const list = JSON.parse(stemsSentJson || "[]");
    return Array.isArray(list) && list.some((n) => typeof n === "string");
  } catch {
    return false;
  }
}

/** Stems asked for and none sent yet: the receipt stays open for them (the sender sees the request, so it tells nothing). */
export const stemsHold = (t: Pick<LifeFacts, "stems_requested_at" | "stems_sent">) => !!t.stems_requested_at && !anyStemSent(t.stems_sent);

/** The receipt's state at `now`. */
export function receiptLife(t: LifeFacts, now = Date.now()): ReceiptLife {
  if (stemsHold(t)) return "open";
  const at = finalAt(t);
  if (now < at) return "open";
  return now < at + RECEIPT_CLOSE_DAYS * DAY ? "read-only" : "closed";
}

/** When the receipt link closes (a stems hold keeps it open past this until the stems arrive). */
export function receiptClosesAt(t: LifeFacts) {
  return finalAt(t) + RECEIPT_CLOSE_DAYS * DAY;
}
