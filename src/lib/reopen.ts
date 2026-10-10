/**
 * Keeping a receiver's link alive.
 *
 * Two things live here: "Email me when it reopens" (senders who hit a closed, full or paused link leave an address and
 * get one email when the link takes uploads again), and the nightly re-route that moves a link off a collection whose
 * closing date has passed, onto the receiver's newest open one, so a link never sits dead by accident.
 */
import "server-only";
import { audit } from "./audit";
import { now, q, USER_COLUMNS, type Collection, type User } from "./db";
import { activeCollection, capacity, isClosed, isPaused } from "./desk";
import { emailText } from "./email-copy";
import { APP_URL, sendMail } from "./mail";

type LinkUser = Pick<User, "id" | "name" | "handle" | "plan" | "paused_at" | "pause_until" | "active_collection_id">;

/** Whether floortest.app/<handle> takes uploads right now (the same rules the public page applies). */
export async function linkAccepting(u: LinkUser) {
  if (isPaused(u)) return false;
  const c = await activeCollection(u);
  if (!c || isClosed(c)) return false;
  return !(await capacity(u)).full;
}

/** A sender asks to hear when this receiver's link reopens. Quiet about duplicates. */
export async function requestReopenAlert(userId: number, email: string) {
  await q.run("INSERT INTO reopen_alerts (user_id, email, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING", userId, email.trim().toLowerCase(), now());
}

/**
 * If the receiver's link takes uploads again, every pending request gets its one email. Called after the actions that
 * can reopen a link (switching collection, editing a closing date, resuming) and nightly for time-based reopenings
 * (a pause that ended on its own, a re-route). Each row is claimed before sending so a retry can't email twice.
 */
export async function sendReopenAlerts(userId: number) {
  const u = await q.get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND suspended_at IS NULL`, userId);
  if (!u || !(await linkAccepting(u))) return 0;
  const pending = await q.all<{ id: number; email: string }>("SELECT id, email FROM reopen_alerts WHERE user_id = ? AND sent_at IS NULL ORDER BY created_at LIMIT 200", userId);
  let sent = 0;
  for (const r of pending) {
    const claimed = await q.run("UPDATE reopen_alerts SET sent_at = ? WHERE id = ? AND sent_at IS NULL", now(), r.id);
    if (!claimed.changes) continue;
    await sendMail({ userId, audience: "sender", to: r.email, ...(await emailText("link_reopened", { receiver: u.name, link: `${APP_URL}/${u.handle}` })) });
    sent++;
  }
  return sent;
}

/** Nightly: every receiver with pending requests whose link is open again gets them sent. */
export async function sweepReopenAlerts() {
  const users = await q.all<{ user_id: number }>("SELECT DISTINCT user_id FROM reopen_alerts WHERE sent_at IS NULL LIMIT 500");
  let sent = 0;
  for (const { user_id } of users) sent += await sendReopenAlerts(user_id);
  return sent;
}

/**
 * A link pointed at a collection whose closing date has passed moves to the receiver's newest open collection (no
 * closing date, or one still ahead, and not full). Full collections are left alone: that's the receiver's cap at work.
 * The move is logged on the account and shows in the bell, so the receiver always knows where their link goes.
 */
export async function rerouteClosedLinks(at = now()) {
  const stuck = await q.all<{ id: number; name: string; handle: string; closed_name: string; closes_at: number }>(
    `SELECT u.id, u.name, u.handle, c.name AS closed_name, c.closes_at FROM users u JOIN collections c ON c.id = u.active_collection_id
     WHERE u.suspended_at IS NULL AND c.closes_at IS NOT NULL AND c.closes_at <= ? AND c.full_at IS NULL LIMIT 500`,
    at,
  );
  let moved = 0;
  for (const u of stuck) {
    const next = await q.get<Collection>(
      `SELECT * FROM collections WHERE user_id = ? AND id <> ? AND full_at IS NULL AND (closes_at IS NULL OR closes_at > ?) ORDER BY created_at DESC LIMIT 1`,
      u.id,
      (await q.get<{ id: number }>("SELECT active_collection_id AS id FROM users WHERE id = ?", u.id))!.id,
      at,
    );
    if (!next) continue;
    const r = await q.run("UPDATE users SET active_collection_id = ? WHERE id = ? AND active_collection_id <> ?", next.id, u.id, next.id);
    if (!r.changes) continue;
    await audit(u.id, "link_rerouted", `${next.name} (${u.closed_name} closed)`);
    await sendReopenAlerts(u.id);
    moved++;
  }
  return moved;
}
