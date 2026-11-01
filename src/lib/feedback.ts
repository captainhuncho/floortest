import "server-only";
import { now, q, type User } from "./db";
import { FEEDBACK_ASK_AFTER, shouldAskFeedback } from "./feedback-ask";

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
  const row = await q.get<{ asked_at: number | null; decisions: number }>(
    `SELECT (SELECT feedback_asked_at FROM users WHERE id = ?) AS asked_at,
            (SELECT COUNT(*)::int FROM (
               SELECT 1 FROM events WHERE type IN ('kept', 'passed') AND (actor_id = ? OR (actor_id IS NULL AND user_id = ?)) LIMIT ?
             ) d) AS decisions`,
    actorId, actorId, actorId, FEEDBACK_ASK_AFTER,
  );
  return !!row && shouldAskFeedback({ decisions: Number(row.decisions), askedAt: row.asked_at == null ? null : Number(row.asked_at) });
}

/** The ask was answered (sent, Not now or Don't ask again): kept on the person's own row, so it's asked once. */
export async function markFeedbackAsked(actorId: number) {
  await q.run("UPDATE users SET feedback_asked_at = ? WHERE id = ? AND feedback_asked_at IS NULL", now(), actorId);
}
