/**
 * The feedback ask (1 Nov): after a person's 5th decision (Keep or Not for me) across their account, the dashboard asks
 * "How's FloorTest working for you?". Sending or "Don't ask again" ends it for good (feedback_asked_at). "Not now" asks
 * once more after 10 further decisions (owner, 1 Nov; feedback_snoozed_at); a second "Not now" ends it. Kept on the
 * person's own users row, so it holds on every device. Pure, so the rule is tested alone.
 */
export const FEEDBACK_ASK_AFTER = 5;
export const FEEDBACK_ASK_AGAIN_AFTER = 10;

export function shouldAskFeedback({ decisions, askedAt, snoozedAt, sinceSnooze = 0 }: { decisions: number; askedAt: number | null | undefined; snoozedAt?: number | null; sinceSnooze?: number }) {
  if (askedAt != null) return false;
  if (snoozedAt != null) return sinceSnooze >= FEEDBACK_ASK_AGAIN_AFTER;
  return decisions >= FEEDBACK_ASK_AFTER;
}

/** What closing the ask records: "Not now" the first time snoozes it; a second "Not now", or "Don't ask again", ends it. */
export const closeOutcome = (choice: "later" | "never", snoozedAt: number | null | undefined): "snooze" | "end" =>
  choice === "later" && snoozedAt == null ? "snooze" : "end";
