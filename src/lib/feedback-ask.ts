/**
 * The one-time feedback ask (1 Nov): after a person's 5th decision (Keep or Not for me) across their account, the
 * dashboard asks "How's FloorTest working for you?" once. Whatever they choose (send, Not now, Don't ask again) is kept
 * on their own users row (feedback_asked_at), so it never comes back, on any device. Pure, so the rule is tested alone.
 */
export const FEEDBACK_ASK_AFTER = 5;

export function shouldAskFeedback({ decisions, askedAt }: { decisions: number; askedAt: number | null | undefined }) {
  return askedAt == null && decisions >= FEEDBACK_ASK_AFTER;
}
