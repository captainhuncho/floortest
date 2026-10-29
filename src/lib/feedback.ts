import "server-only";
import { now, q, type User } from "./db";

const KINDS = ["Idea", "Bug", "Confusing", "Love it"];

/**
 * Beta feedback lands in the admin inbox, tagged with the page it came from. It's filed under the desk it was sent
 * from (user_id) but signed by the person who sent it (actor_id, name, email), so a teammate's feedback gets the reply,
 * not the account owner, and erasing that person's data by email finds it.
 */
export async function fileFeedback(desk: Pick<User, "id" | "actor_id">, kind: string, message: string, path: string) {
  const body = String(message || "").trim().slice(0, 3000);
  if (!body) return;
  const person = await q.get<{ name: string; email: string }>("SELECT name, email FROM users WHERE id = ?", desk.actor_id);
  if (!person) return;
  const topic = KINDS.includes(kind) ? `Feedback · ${kind}` : "Feedback";
  await q.run(
    "INSERT INTO contact_messages (user_id, actor_id, name, email, topic, message, page, created_at) VALUES (?,?,?,?,?,?,?,?)",
    desk.id, desk.actor_id, person.name, person.email, topic, body, String(path || "").slice(0, 200), now(),
  );
}
