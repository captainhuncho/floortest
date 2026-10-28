import "server-only";
import { env } from "./env";
import { now, q } from "./db";
import { APP_URL, queueMail, sendMail } from "./mail";

const DAY = 86_400_000;

/**
 * One gentle reminder per track: still unheard and undecided 14 days after delivery. It goes to
 * the receiver, never the sender, and a receiver gets at most one reminder email per run.
 */
export async function runNudges(at = now()) {
  const tracks = await q.all<{ id: number; user_id: number; title: string; artist: string; sender: string }>(
    `SELECT t.id, t.user_id, t.title, t.artist, s.name AS sender FROM tracks t
       JOIN senders s ON s.id = t.sender_id JOIN users u ON u.id = t.user_id
     WHERE t.deleted_at IS NULL AND t.played_at IS NULL AND t.decision IS NULL AND t.nudged_at IS NULL
       AND t.created_at < ? AND u.suspended_at IS NULL AND u.notify_alerts = 1
     ORDER BY t.user_id, t.created_at LIMIT 500`,
    at - 14 * DAY,
  );
  const byUser = new Map<number, typeof tracks>();
  for (const t of tracks) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t]);
  let sent = 0;
  for (const [userId, list] of byUser) {
    const u = await q.get<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = ?", userId);
    if (!u) continue;
    const lines = list.slice(0, 10).map((t) => `• ${t.artist} – ${t.title} (from ${t.sender})`);
    if (list.length > 10) lines.push(`• …and ${list.length - 10} more`);
    const ids = list.map((t) => t.id);
    const marks = ids.map(() => "?").join(",");
    // Marked and queued together, so a crash or rerun can't remind twice; the queue retries a failed send.
    const queued = await q.tx(async (db) => {
      const claimed = await db.run(`UPDATE tracks SET nudged_at = ? WHERE id IN (${marks}) AND nudged_at IS NULL`, at, ...ids);
      if (!claimed.changes) return false;
      await queueMail(
        {
          unsubscribe: "alerts",
          userId,
          audience: "receiver",
          to: u.email,
          subject: `${list.length} track${list.length === 1 ? "" : "s"} still waiting on FloorTest`,
          body: [`Hi ${u.name.split(/\s+/)[0]},`, "", "These have been on your desk for two weeks without a listen:", "", ...lines, "", `Give them a spin: ${APP_URL}/dashboard?view=queue`, "", "You'll only be reminded once per track.", "", "— FloorTest"].join("\n"),
        },
        db,
      );
      return true;
    });
    if (queued) sent++;
  }
  return sent;
}

const setState = (key: string, value: string, at: number) =>
  q.run("INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", key, value, at);

/**
 * Monday metrics email to the admins. Runs from the daily job and sends at most once a week. It only counts as sent once
 * every admin's copy went through: a failed copy is retried on the next daily run (for up to 6 days), and only to the
 * admins who didn't get it (Codex review, 19 Oct). The round in progress is kept in app_state `admin_digest_round`.
 */
export async function runAdminDigest(at = now()) {
  if (!env.adminEmails.length) return false;
  const last = Number((await q.get<{ value: string }>("SELECT value FROM app_state WHERE key = 'admin_digest'"))?.value ?? 0);
  let round: { started: number; done: string[] } | null = null;
  try {
    round = JSON.parse((await q.get<{ value: string }>("SELECT value FROM app_state WHERE key = 'admin_digest_round'"))?.value ?? "null");
  } catch {
    round = null;
  }
  if (round && at - round.started >= 6 * DAY) round = null;
  if (!round) {
    if (new Date(at).getUTCDay() !== 1 || at - last < 6 * DAY) return false;
    round = { started: at, done: [] };
  }
  const c = (sql: string, ...a: number[]) => q.count(sql, ...a);
  const week = at - 7 * DAY;
  const lines = [
    `New receivers: ${await c("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", week)} (total ${await c("SELECT COUNT(*) AS n FROM users")})`,
    `Tracks received: ${await c("SELECT COUNT(*) AS n FROM tracks WHERE created_at >= ?", week)}`,
    `Active receivers: ${await c("SELECT COUNT(DISTINCT user_id) AS n FROM account_log WHERE created_at >= ?", week)}`,
    `Decisions: ${await c("SELECT COUNT(*) AS n FROM tracks WHERE decided_at >= ?", week)} (${await c("SELECT COUNT(*) AS n FROM tracks WHERE decision = 'kept' AND decided_at >= ?", week)} kept)`,
    `Played out: ${await c("SELECT COUNT(*) AS n FROM tracks WHERE played_out_at >= ?", week)}`,
    `Waitlist: ${await c("SELECT COUNT(*) AS n FROM waitlist WHERE invited_at IS NULL")} waiting (+${await c("SELECT COUNT(*) AS n FROM waitlist WHERE created_at >= ?", week)} this week)`,
    `Open messages: ${await c("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL AND topic NOT LIKE 'Feedback%'")}`,
    `New feedback: ${await c("SELECT COUNT(*) AS n FROM contact_messages WHERE topic LIKE 'Feedback%' AND feedback_status = 'new'")}`,
    `Incidents: ${await c("SELECT COUNT(*) AS n FROM incidents WHERE created_at >= ?", week)}`,
  ];
  for (const to of env.adminEmails) {
    if (round.done.includes(to)) continue;
    const status = await sendMail({
      userId: null,
      audience: "support",
      to,
      subject: "FloorTest this week",
      body: ["The last 7 days on FloorTest:", "", ...lines.map((l) => `• ${l}`), "", `Details: ${env.opsUrl}/admin/metrics`, "", "— FloorTest"].join("\n"),
    });
    if (!status.startsWith("failed")) round.done.push(to);
  }
  if (env.adminEmails.some((to) => !round.done.includes(to))) {
    await setState("admin_digest_round", JSON.stringify(round), at);
    return false;
  }
  await setState("admin_digest", String(round.started), at);
  await q.run("DELETE FROM app_state WHERE key = 'admin_digest_round'");
  return true;
}
