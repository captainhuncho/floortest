import "server-only";
import { now, q } from "./db";
import { APP_URL, sendMail } from "./mail";

const DAY = 86_400_000;
const first = (name: string) => name.split(/\s+/)[0];

/** The welcome email, sent once when an account's email is confirmed (by link or by sign-in code). */
export async function sendWelcome(userId: number) {
  // Claim first, so a double confirm can't send it twice.
  const u = await q.get<{ email: string; name: string; handle: string }>(
    "UPDATE users SET welcomed_at = ? WHERE id = ? AND welcomed_at IS NULL RETURNING email, name, handle",
    now(),
    userId,
  );
  if (!u) return;
  const link = `${APP_URL}/${u.handle}`;
  await sendMail({
    userId,
    audience: "receiver",
    to: u.email,
    subject: `Your link is live: ${link.replace(/^https?:\/\//, "")}`,
    body: [
      `Hi ${first(u.name)},`,
      "",
      `Your receiving link is ready: ${link}`,
      "",
      "Put it in your bio or your next callout. Artists upload the original file and you'll get an email when tracks arrive (change how often in Notifications).",
      "",
      "On your desk:",
      "• Space plays",
      "• K keeps, X marks not for me, and the next track starts",
      "• U undoes",
      "",
      "Kept tracks download as a crate with a Rekordbox XML.",
      "",
      "Reply to this email with anything that's broken or missing. During the beta, I read every one.",
      "",
      "— FloorTest",
    ].join("\n"),
  });
}

/** One nudge, 7 days after sign-up, to receivers whose link hasn't had a track yet. */
export async function runFirstTrackNudges(at = now()) {
  const users = await q.all<{ id: number; email: string; name: string; handle: string }>(
    `SELECT u.id, u.email, u.name, u.handle FROM users u
     WHERE u.first_track_nudged_at IS NULL AND u.created_at < ? AND u.suspended_at IS NULL AND u.notify_alerts = 1 AND u.email_verified_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id)
     LIMIT 200`,
    at - 7 * DAY,
  );
  let sent = 0;
  for (const u of users) {
    const claimed = await q.run("UPDATE users SET first_track_nudged_at = ? WHERE id = ? AND first_track_nudged_at IS NULL", at, u.id);
    if (!claimed.changes) continue;
    const link = `${APP_URL}/${u.handle}`;
    const status = await sendMail({
      unsubscribe: "alerts",
      userId: u.id,
      audience: "receiver",
      to: u.email,
      subject: "Nothing on your desk yet",
      body: [
        `Hi ${first(u.name)},`,
        "",
        "Your link hasn't had a track yet. The quickest way to get the first one: post a callout with your link, for example:",
        "",
        `"Sending me music? Upload the WAV here: ${link}. You'll know when I've listened."`,
        "",
        "— FloorTest",
      ].join("\n"),
    });
    if (status.startsWith("failed")) await q.run("UPDATE users SET first_track_nudged_at = NULL WHERE id = ?", u.id);
    else sent++;
  }
  return sent;
}
