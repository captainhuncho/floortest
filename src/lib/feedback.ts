import "server-only";
import { now, q, type User } from "./db";
import { closeOutcome, FEEDBACK_ASK_AFTER, FEEDBACK_ASK_AGAIN_AFTER, shouldAskFeedback } from "./feedback-ask";

const KINDS = ["Idea", "Bug", "Confusing", "Love it"];

/** The sender's window width as sent by the browser: a whole number from 0 to 10000, or nothing. */
export const cleanViewport = (v: unknown) => {
  const n = Number(v);
  return v == null || v === "" || !Number.isFinite(n) ? null : Math.min(10000, Math.max(0, Math.round(n)));
};

/**
 * Beta feedback lands in the admin inbox, tagged with the page it came from. It's filed under the desk it was sent
 * from (user_id) but signed by the person who sent it (actor_id, name, email), so a teammate's feedback gets the reply,
 * not the account owner, and erasing that person's data by email finds it. The window width (viewport) says which
 * screen size it came from.
 */
export async function fileFeedback(desk: Pick<User, "id" | "actor_id">, kind: string, message: string, path: string, viewport?: unknown) {
  const body = String(message || "").trim().slice(0, 3000);
  if (!body) return;
  const person = await q.get<{ name: string; email: string }>("SELECT name, email FROM users WHERE id = ?", desk.actor_id);
  if (!person) return;
  const topic = KINDS.includes(kind) ? `Feedback · ${kind}` : "Feedback";
  await q.run(
    "INSERT INTO contact_messages (user_id, actor_id, name, email, topic, message, page, viewport, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    desk.id, desk.actor_id, person.name, person.email, topic, body, String(path || "").slice(0, 200), cleanViewport(viewport), now(),
  );
}

/**
 * Is the one-time ask due for this person (src/lib/feedback-ask.ts)? One cheap read: their own asked-at, and their
 * decisions counted only up to the threshold. A decision on their own desk is logged with no actor (logEvent), one on a
 * team desk with them as actor; both indexed (events_user, fk_events_actor_id).
 */
export async function feedbackAskDue(actorId: number) {
  const me = await q.get<{ asked_at: number | null; snoozed_at: number | null }>("SELECT feedback_asked_at AS asked_at, feedback_snoozed_at AS snoozed_at FROM users WHERE id = ?", actorId);
  if (!me || me.asked_at != null) return false;
  const snoozedAt = me.snoozed_at == null ? null : Number(me.snoozed_at);
  // Before a snooze, count to 5 from the start; after one, count to 10 from the snooze.
  const row = await q.get<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM (
       SELECT 1 FROM events WHERE type IN ('kept', 'passed') AND (actor_id = ? OR (actor_id IS NULL AND user_id = ?)) AND created_at > ? LIMIT ?
     ) d`,
    actorId, actorId, snoozedAt ?? 0, snoozedAt == null ? FEEDBACK_ASK_AFTER : FEEDBACK_ASK_AGAIN_AFTER,
  );
  const n = Number(row?.n ?? 0);
  return shouldAskFeedback({ decisions: n, askedAt: null, snoozedAt, sinceSnooze: n });
}

/** The ask was sent from, or ended with Don't ask again (or a second Not now): it isn't asked again. */
export async function markFeedbackAsked(actorId: number) {
  await q.run("UPDATE users SET feedback_asked_at = ? WHERE id = ? AND feedback_asked_at IS NULL", now(), actorId);
}

/** Closing the ask: the first "Not now" snoozes it for 10 decisions; anything else ends it (lib/feedback-ask). */
export async function closeFeedbackAskFor(actorId: number, choice: "later" | "never") {
  const me = await q.get<{ snoozed_at: number | null }>("SELECT feedback_snoozed_at AS snoozed_at FROM users WHERE id = ?", actorId);
  if (!me) return;
  if (closeOutcome(choice, me.snoozed_at == null ? null : Number(me.snoozed_at)) === "snooze")
    await q.run("UPDATE users SET feedback_snoozed_at = ? WHERE id = ? AND feedback_snoozed_at IS NULL AND feedback_asked_at IS NULL", now(), actorId);
  else await markFeedbackAsked(actorId);
}
