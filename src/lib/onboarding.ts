import "server-only";
import { EMAILS, emailText } from "./email-copy";
import { now, q } from "./db";
import { APP_URL, queueMail, sendMail } from "./mail";

const DAY = 86_400_000;
/** How emails greet someone: their first name, or their public name for accounts made before we asked. */
const first = (u: { first_name?: string; name: string }) => u.first_name || u.name.split(/\s+/)[0];

/** The welcome email, sent once when an account's email is confirmed (by link or by sign-in code). */
export async function sendWelcome(userId: number) {
  // Claim first, so a double confirm can't send it twice.
  const u = await q.get<{ email: string; name: string; first_name: string; handle: string }>(
    "UPDATE users SET welcomed_at = ? WHERE id = ? AND welcomed_at IS NULL RETURNING email, name, first_name, handle",
    now(),
    userId,
  );
  if (!u) return;
  const link = `${APP_URL}/${u.handle}`;
  await sendMail({
    userId,
    audience: "receiver",
    to: u.email,
    ...(await emailText("welcome", { first_name: first(u), link, link_short: link.replace(/^https?:\/\//, "") })),
  });
}

/** Onboarding's one job is the first track within 48 hours (PRODUCT.md): one nudge, 2 days after sign-up, if the link hasn't had one. */
export const FIRST_TRACK_NUDGE_DAYS = 2;

/** One nudge, FIRST_TRACK_NUDGE_DAYS after sign-up, to receivers whose link hasn't had a track yet. */
export async function runFirstTrackNudges(at = now()) {
  const users = await q.all<{ id: number; email: string; name: string; first_name: string; handle: string }>(
    `SELECT u.id, u.email, u.name, u.first_name, u.handle FROM users u
     WHERE u.first_track_nudged_at IS NULL AND u.created_at < ? AND u.suspended_at IS NULL AND u.notify_alerts = 1 AND u.email_verified_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id)
     LIMIT 200`,
    at - FIRST_TRACK_NUDGE_DAYS * DAY,
  );
  let sent = 0;
  for (const u of users) {
    const text = await emailText("first_track_nudge", { first_name: first(u), link: `${APP_URL}/${u.handle}` });
    // Marked and queued together, so a rerun can't nudge twice; the queue retries a failed send.
    const queued = await q.tx(async (db) => {
      const claimed = await db.run("UPDATE users SET first_track_nudged_at = ? WHERE id = ? AND first_track_nudged_at IS NULL", at, u.id);
      if (!claimed.changes) return false;
      await queueMail({ unsubscribe: EMAILS.first_track_nudge.unsubscribe, userId: u.id, audience: "receiver", to: u.email, ...text }, db);
      return true;
    });
    if (queued) sent++;
  }
  return sent;
}
