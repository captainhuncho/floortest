import "server-only";
import { now, q } from "./db";
import { APP_URL, sendMail } from "./mail";
import { recordIncident } from "./incidents";
import { RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS } from "./plans";

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
  notify_product: number;
  notify_marketing: number;
  tz: string;
  last_digest_at: number | null;
  alert_full_sent_at: number | null;
};

export async function prefsFor(userId: number) {
  return (await q.get<NotifyPrefs>(
    `SELECT id, email, name, notify_submissions, digest_hour, quiet_start, quiet_end, notify_alerts, notify_product, notify_marketing, tz, last_digest_at, alert_full_sent_at
     FROM users WHERE id = ?`,
    userId,
  ))!;
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
  const p = await prefsFor(receiverId);
  if (p.notify_submissions !== "instant" || inQuietHours(p)) return;
  const t = (await q.get<{ title: string; artist: string; message: string; sender: string; collection: string | null }>(
    `SELECT t.title, t.artist, t.message, s.name AS sender, c.name AS collection FROM tracks t
     JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id WHERE t.id = ?`,
    trackId,
  ))!;
  await sendMail({
      unsubscribe: "submissions",
    userId: p.id,
    audience: "receiver",
    to: p.email,
    subject: `New track: ${t.artist} – ${t.title}`,
    body: [
      `${t.sender} sent "${t.title}"${t.collection ? ` to ${t.collection}` : ""}.`,
      t.message ? `\n"${t.message}"` : "",
      `\nListen: ${APP_URL}/dashboard?view=queue&s=all&t=${trackId}`,
      `\nChange how often you hear from us: ${APP_URL}/dashboard/notifications`,
      "\n— FloorTest",
    ].join("\n"),
  });
  await q.run("UPDATE tracks SET receiver_notified_at = ? WHERE id = ?", now(), trackId);
}

/**
 * Storage emails, each sent once and re-armed when space frees up:
 * a heads-up at 80% of the desk, and a notice when the link pauses because it's full.
 */
export async function alertIfFull(receiverId: number, cap: { used: number; limit: number; full: boolean }) {
  const nearly = !cap.full && cap.used >= Math.ceil(cap.limit * 0.8);
  if (!cap.full) await q.run("UPDATE users SET alert_full_sent_at = NULL WHERE id = ? AND alert_full_sent_at IS NOT NULL", receiverId);
  if (!nearly && !cap.full) await q.run("UPDATE users SET alert_80_sent_at = NULL WHERE id = ? AND alert_80_sent_at IS NOT NULL", receiverId);
  if (!nearly && !cap.full) return;

  // Claim the alert atomically so two concurrent uploads can't both send it.
  const column = cap.full ? "alert_full_sent_at" : "alert_80_sent_at";
  const p = await q.get<{ email: string }>(
    `UPDATE users SET ${column} = ? WHERE id = ? AND notify_alerts = 1 AND ${column} IS NULL RETURNING email`,
    now(),
    receiverId,
  );
  if (!p) return;
  const plans = `${APP_URL}/dashboard/plans`;
  await sendMail({
    unsubscribe: "alerts",
    ...(cap.full
      ? {
          userId: receiverId,
          audience: "receiver",
          to: p.email,
          subject: "Your FloorTest link is paused",
          body: `Your desk is full (${cap.used} of ${cap.limit} tracks), so your link has stopped accepting uploads.\n\nClear some tracks, or move to a bigger plan (free during the beta), to reopen it: ${plans}\n\n— FloorTest`,
        }
      : {
          userId: receiverId,
          audience: "receiver",
          to: p.email,
          subject: "Your FloorTest desk is 80% full",
          body: `You're using ${cap.used} of ${cap.limit} tracks. When it's full, your link stops accepting uploads.\n\nClear tracks you've decided on, or see bigger plans (free during the beta): ${plans}\n\n— FloorTest`,
        }),
  });
}

const WARN_DAYS = 7;

/**
 * Daily: one email per receiver listing tracks that will be auto-deleted within a week,
 * so nothing disappears without notice. Each track is only warned about once.
 */
export async function warnExpiring(at = now()) {
  const day = 86_400_000;
  const rows = await q.all<{ id: number; user_id: number; title: string; artist: string; decision: string | null; email: string }>(
    `SELECT t.id, t.user_id, t.title, t.artist, t.decision, u.email FROM tracks t JOIN users u ON u.id = t.user_id
     WHERE t.deleted_at IS NULL AND t.expiry_warned_at IS NULL AND u.notify_alerts = 1 AND (
       (t.decision IS NULL AND t.created_at < ?) OR (t.decision = 'passed' AND t.decided_at < ?))
     ORDER BY t.user_id, t.created_at LIMIT 2000`,
    at - (RETAIN_UNREVIEWED_DAYS - WARN_DAYS) * day,
    at - (RETAIN_PASSED_DAYS - WARN_DAYS) * day,
  );
  const byUser = new Map<number, typeof rows>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  for (const [userId, list] of byUser) {
    const undecided = list.filter((r) => !r.decision).length;
    const ids = list.map((r) => r.id);
    const marks = ids.map(() => "?").join(",");
    // Claim first so a crash or rerun can't warn twice; a failed send hands them back for tomorrow.
    const claimed = await q.run(`UPDATE tracks SET expiry_warned_at = ? WHERE id IN (${marks}) AND expiry_warned_at IS NULL`, at, ...ids);
    if (!claimed.changes) continue;
    const status = await sendMail({
      unsubscribe: "alerts",
      userId,
      audience: "receiver",
      to: list[0].email,
      subject: `${list.length} track${list.length === 1 ? "" : "s"} will be deleted in ${WARN_DAYS} days`,
      body: [
        `These tracks are deleted automatically in about ${WARN_DAYS} days:`,
        "",
        ...list.slice(0, 20).map((r) => `- ${r.artist} – ${r.title}${r.decision ? " (Not for me)" : ""}`),
        list.length > 20 ? `…and ${list.length - 20} more.` : "",
        "",
        undecided
          ? `Keep anything you want to hold on to: ${APP_URL}/dashboard?view=list&s=review`
          : `Nothing to do if you're happy for them to go. Changed your mind? ${APP_URL}/dashboard?view=list&s=passed`,
        "",
        "— FloorTest",
      ].join("\n"),
    });
    if (status.startsWith("failed")) await q.run(`UPDATE tracks SET expiry_warned_at = NULL WHERE id IN (${marks})`, ...ids);
  }
  return { warned: rows.length, receivers: byUser.size };
}

type Pending = { id: number; title: string; artist: string; sender: string };

/** Sends one receiver's digest of tracks they haven't been emailed about. Returns how many tracks it covered. */
export async function sendDigest(userId: number) {
  const p = await prefsFor(userId);
  const items = await q.all<Pending>(
    `SELECT t.id, t.title, t.artist, s.name AS sender FROM tracks t JOIN senders s ON s.id = t.sender_id
     WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.receiver_notified_at IS NULL AND t.decision IS NULL
     ORDER BY t.created_at`,
    userId,
  );
  if (!items.length) {
    await q.run("UPDATE users SET last_digest_at = ? WHERE id = ?", now(), userId);
    return 0;
  }
  // Claim the tracks before sending, so a crash or a second run can't email them twice.
  const marks = items.map(() => "?").join(",");
  const claimed = await q.all<{ id: number }>(
    `UPDATE tracks SET receiver_notified_at = ? WHERE id IN (${marks}) AND receiver_notified_at IS NULL RETURNING id`,
    now(),
    ...items.map((t) => t.id),
  );
  if (!claimed.length) return 0;
  const lines = items.slice(0, 25).map((t) => `• ${t.artist} – ${t.title} (from ${t.sender})`);
  if (items.length > 25) lines.push(`• …and ${items.length - 25} more`);
  const status = await sendMail({
    unsubscribe: "submissions",
    userId,
    audience: "receiver",
    to: p.email,
    subject: `${items.length} new track${items.length === 1 ? "" : "s"} waiting on FloorTest`,
    body: [`Hi ${p.name.split(/\s+/)[0]},`, "", ...lines, "", `Start listening: ${APP_URL}/dashboard`, "", `Digest settings: ${APP_URL}/dashboard/notifications`, "", "— FloorTest"].join("\n"),
  });
  if (status.startsWith("failed")) {
    // Hand the tracks back so the next run tries again; the digest isn't marked as sent.
    await q.run(`UPDATE tracks SET receiver_notified_at = NULL WHERE id IN (${claimed.map(() => "?").join(",")})`, ...claimed.map((c) => c.id));
    return 0;
  }
  await q.run("UPDATE users SET last_digest_at = ? WHERE id = ?", now(), userId);
  return items.length;
}

/**
 * Scheduled job. Digest users get their summary at their chosen hour; instant users get anything
 * held back by quiet hours once those hours end. A receiver is due when their target hour has
 * passed since their last digest, so an hourly schedule hits the hour exactly and a daily one
 * (Vercel Hobby) still sends once a day.
 */
export async function runDigests(at = now()) {
  const users = await q.all<Pick<NotifyPrefs, "id" | "notify_submissions" | "digest_hour" | "quiet_start" | "quiet_end" | "tz" | "last_digest_at">>(
    "SELECT id, notify_submissions, digest_hour, quiet_start, quiet_end, tz, last_digest_at FROM users WHERE notify_submissions IN ('digest', 'instant')",
  );
  let sent = 0;
  let failed = 0;
  for (const p of users) {
    const target = p.notify_submissions === "digest" ? p.digest_hour : p.quiet_end;
    if (target == null) continue;
    if (p.notify_submissions === "instant" && inQuietHours(p, at)) continue;
    const hoursSince = (localHour(p.tz, at) - target + 24) % 24;
    const lastTarget = at - (at % 3_600_000) - hoursSince * 3_600_000;
    if (p.last_digest_at && p.last_digest_at >= lastTarget) continue;
    // One receiver's problem never stops everyone else's digest.
    try {
      if (await sendDigest(p.id)) sent++;
    } catch (e) {
      failed++;
      console.error("[digest] receiver", p.id, e);
    }
  }
  if (failed) await recordIncident("email_failed", `${failed} digest${failed === 1 ? "" : "s"} could not be sent`, "They'll be retried on the next run.");
  return sent;
}
