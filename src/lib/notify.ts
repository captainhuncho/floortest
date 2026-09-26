import "server-only";
import { db, now } from "./db";
import { APP_URL, sendMail } from "./mail";

/** How a receiver hears about new tracks. Emails go to the receiver's own address. */
export type NotifyPrefs = {
  id: number;
  email: string;
  name: string;
  notify_submissions: "instant" | "digest" | "off";
  digest_hour: number;
  quiet_start: number | null;
  quiet_end: number | null;
  notify_alerts: number;
  tz: string;
  last_digest_at: number | null;
  alert_full_sent_at: number | null;
};

export function prefsFor(userId: number) {
  return db()
    .prepare(
      `SELECT id, email, name, notify_submissions, digest_hour, quiet_start, quiet_end, notify_alerts, tz, last_digest_at, alert_full_sent_at
       FROM users WHERE id = ?`,
    )
    .get(userId) as NotifyPrefs;
}

/** The hour (0–23) at `ts` in the receiver's timezone. */
export function localHour(tz: string, ts = now()) {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(ts));
  } catch {
    return new Date(ts).getUTCHours();
  }
}

/** Quiet hours may wrap midnight (e.g. 23 → 8). */
export function inQuietHours(p: Pick<NotifyPrefs, "quiet_start" | "quiet_end" | "tz">, ts = now()) {
  if (p.quiet_start == null || p.quiet_end == null || p.quiet_start === p.quiet_end) return false;
  const h = localHour(p.tz, ts);
  return p.quiet_start < p.quiet_end ? h >= p.quiet_start && h < p.quiet_end : h >= p.quiet_start || h < p.quiet_end;
}

/** Called after a track is delivered. Instant mode emails now unless it's quiet hours; otherwise the digest picks it up. */
export async function notifyNewSubmission(receiverId: number, trackId: number) {
  const p = prefsFor(receiverId);
  if (p.notify_submissions !== "instant" || inQuietHours(p)) return;
  const t = db()
    .prepare(
      `SELECT t.title, t.artist, t.message, s.name AS sender, c.name AS collection FROM tracks t
       JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id WHERE t.id = ?`,
    )
    .get(trackId) as { title: string; artist: string; message: string; sender: string; collection: string | null };
  await sendMail({
    userId: p.id,
    audience: "receiver",
    to: p.email,
    subject: `New track: ${t.artist} – ${t.title}`,
    body: [
      `${t.sender} sent "${t.title}"${t.collection ? ` to ${t.collection}` : ""}.`,
      t.message ? `\n"${t.message}"` : "",
      `\nListen: ${APP_URL}/dashboard?view=queue&s=all&t=${trackId}`,
      `\nChange how often you hear from us: ${APP_URL}/dashboard/notifications`,
    ].join("\n"),
  });
  db().prepare("UPDATE tracks SET receiver_notified_at = ? WHERE id = ?").run(now(), trackId);
}

/** One email when the link pauses because the desk is full. Re-arms once there's space again. */
export async function alertIfFull(receiverId: number, full: boolean) {
  const p = prefsFor(receiverId);
  if (!full) {
    if (p.alert_full_sent_at) db().prepare("UPDATE users SET alert_full_sent_at = NULL WHERE id = ?").run(p.id);
    return;
  }
  if (!p.notify_alerts || p.alert_full_sent_at) return;
  db().prepare("UPDATE users SET alert_full_sent_at = ? WHERE id = ?").run(now(), p.id);
  await sendMail({
    userId: p.id,
    audience: "receiver",
    to: p.email,
    subject: "Your FloorTest link is paused",
    body: `Your desk is full, so your link has stopped accepting uploads.\n\nDelete tracks or upgrade to reopen it: ${APP_URL}/dashboard/settings`,
  });
}

type Pending = { id: number; title: string; artist: string; sender: string; created_at: number };

function pendingFor(userId: number) {
  return db()
    .prepare(
      `SELECT t.id, t.title, t.artist, s.name AS sender, t.created_at FROM tracks t JOIN senders s ON s.id = t.sender_id
       WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.receiver_notified_at IS NULL AND t.decision IS NULL
       ORDER BY t.created_at`,
    )
    .all(userId) as Pending[];
}

/** Sends one receiver's digest of tracks they haven't been emailed about. Returns how many tracks it covered. */
export async function sendDigest(userId: number) {
  const p = prefsFor(userId);
  const items = pendingFor(userId);
  db().prepare("UPDATE users SET last_digest_at = ? WHERE id = ?").run(now(), userId);
  if (!items.length) return 0;
  const lines = items.slice(0, 25).map((t) => `• ${t.artist} – ${t.title} (from ${t.sender})`);
  if (items.length > 25) lines.push(`• …and ${items.length - 25} more`);
  await sendMail({
    userId,
    audience: "receiver",
    to: p.email,
    subject: `${items.length} new track${items.length === 1 ? "" : "s"} waiting on FloorTest`,
    body: [`Hi ${p.name.split(/\s+/)[0]},`, "", ...lines, "", `Start listening: ${APP_URL}/dashboard`, "", `Digest settings: ${APP_URL}/dashboard/notifications`].join("\n"),
  });
  const mark = db().prepare("UPDATE tracks SET receiver_notified_at = ? WHERE id = ?");
  for (const t of items) mark.run(now(), t.id);
  return items.length;
}

/**
 * Hourly job. Digest users get their summary at their chosen hour; instant users get anything
 * held back by quiet hours when those hours end.
 */
export async function runDigests(at = now()) {
  const users = db()
    .prepare("SELECT id FROM users WHERE notify_submissions IN ('digest', 'instant')")
    .all() as { id: number }[];
  let sent = 0;
  for (const { id } of users) {
    const p = prefsFor(id);
    const hour = localHour(p.tz, at);
    const target = p.notify_submissions === "digest" ? p.digest_hour : p.quiet_end;
    if (target == null || hour !== target) continue;
    if (p.last_digest_at && at - p.last_digest_at < 20 * 3_600_000) continue;
    if (await sendDigest(id)) sent++;
  }
  return sent;
}
