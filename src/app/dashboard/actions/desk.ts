"use server";

/** Around the desk: feedback, onboarding, the Send page lookup, notifications, search and pausing the link. */
import { revalidatePath } from "next/cache";
import { receiverLookup } from "@/lib/receiver-lookup";
import { requireUser } from "@/lib/auth";
import { likeContains, now, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { done } from "./common";

/** Beta feedback lands in the admin inbox, tagged with the page it came from. */
export async function sendFeedback(kind: string, message: string, path: string) {
  const u = await requireUser();
  const body = String(message || "").trim().slice(0, 3000);
  if (!body) return;
  const topic = ["Idea", "Bug", "Confusing", "Love it"].includes(kind) ? `Feedback · ${kind}` : "Feedback";
  await q.run(
    "INSERT INTO contact_messages (user_id, name, email, topic, message, page, created_at) VALUES (?,?,?,?,?,?,?)",
    u.id,
    u.name,
    u.email,
    topic,
    body,
    String(path || "").slice(0, 200),
    now(),
  );
}

export async function dismissOnboarding() {
  const u = await requireUser();
  await q.run("UPDATE users SET onboarding_dismissed_at = ? WHERE id = ?", now(), u.id);
  done();
}

export type { ReceiverLookup } from "@/lib/receiver-lookup";

/** Who is floortest.../<handle>? Used by the Send page as you type. */
export async function lookupReceiver(raw: string) {
  return receiverLookup(await requireUser(), raw);
}

/** "Clear all": the bell starts empty again. Live alerts (desk full, paused) stay while they're true. */
export async function clearNotifications() {
  const u = await requireUser();
  await q.run("UPDATE users SET notifications_cleared_at = ?, notifications_seen_at = ? WHERE id = ?", now(), now(), u.id);
  done();
}

export async function markNotificationsRead() {
  const u = await requireUser();
  await q.run("UPDATE users SET notifications_seen_at = ? WHERE id = ?", now(), u.id);
  done();
}

export type SearchHit = { kind: "track" | "contact"; id: number; title: string; detail: string; href: string };

/** Type-ahead for the search dialog: a few tracks and contacts matching the query. */
export async function quickSearch(query: string): Promise<SearchHit[]> {
  const u = await requireUser();
  const text = String(query ?? "").trim().slice(0, 100);
  if (!text) return [];
  const like = likeContains(text);
  const tracks = await q.all<{ id: number; title: string; artist: string; sender: string }>(
    `SELECT t.id, t.title, t.artist, s.name AS sender FROM tracks t JOIN senders s ON s.id = t.sender_id
     WHERE t.user_id = ? AND t.deleted_at IS NULL AND (t.title ILIKE ? OR t.artist ILIKE ? OR t.genre ILIKE ?) ORDER BY t.created_at DESC LIMIT 6`,
    u.id,
    like,
    like,
    like,
  );
  const contacts = await q.all<{ id: number; name: string; email: string }>(
    "SELECT id, name, email FROM senders WHERE user_id = ? AND (name ILIKE ? OR email ILIKE ?) ORDER BY lower(name) LIMIT 4",
    u.id,
    like,
    like,
  );
  return [
    ...tracks.map((t) => ({ kind: "track" as const, id: t.id, title: `${t.artist} - ${t.title}`, detail: `from ${t.sender}`, href: `/dashboard/review?view=queue&s=all&t=${t.id}` })),
    ...contacts.map((c) => ({ kind: "contact" as const, id: c.id, title: c.name, detail: c.email, href: `/dashboard/contacts/${c.id}` })),
  ];
}

export async function pauseLink(form: FormData) {
  const u = await requireUser();
  const message = String(form.get("message") || "").trim().slice(0, 280);
  const until = String(form.get("until") || "");
  const offset = Number(form.get("tz") || 0);
  // "Until 12 Oct" means back on the morning of the 12th, receiver's local time.
  const untilAt = /^\d{4}-\d{2}-\d{2}$/.test(until) ? Date.parse(`${until}T00:00:00Z`) + (Number.isFinite(offset) ? offset : 0) * 60_000 : null;
  await q.run("UPDATE users SET paused_at = ?, pause_until = ?, pause_message = ? WHERE id = ?", now(), untilAt && untilAt > now() ? untilAt : null, message, u.id);
  await audit(u.id, "link_paused", message);
  done();
  revalidatePath(`/${u.handle}`);
}

export async function resumeLink() {
  const u = await requireUser();
  await q.run("UPDATE users SET paused_at = NULL, pause_until = NULL WHERE id = ?", u.id);
  await audit(u.id, "link_resumed");
  done();
  revalidatePath(`/${u.handle}`);
}
