/** Retention: the nightly clean-up of old records and of tracks past their retention. */
import "server-only";
import { after } from "next/server";
import { drainNow, queueDeletion, retireTrackFiles } from "./deletion";
import { now, q } from "./db";
import { RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS } from "./plans";
import { storage } from "./storage";
import { UPLOAD_TTL } from "./intake";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Retention and cleanup. Runs from the daily cron; also opportunistically (at most every
 * 10 minutes per server instance) so single-server installs don't depend on a scheduler.
 */
/** How long records are kept before the nightly clean-up deletes them (days). */
export const KEEP_DAYS = { outbox: 90, incidents: 90, events: 730, account_log: 365, admin_log: 730, share_access: 365 } as const;

const BATCH = 5000;

/** The nightly job stops starting new batches after this, so it always finishes inside the function's time limit. */
const PURGE_BUDGET_MS = 150_000;

/** Deletes matching rows a batch at a time (so one huge delete never locks a table), until none are left or time runs out. */
async function deleteInBatches(table: string, where: string, args: unknown[], until: number) {
  let total = 0;
  for (;;) {
    const r = await q.run(`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE ${where} LIMIT ${BATCH})`, ...args);
    total += r.changes ?? 0;
    if ((r.changes ?? 0) < BATCH || Date.now() > until) return total;
  }
}

/**
 * Short-lived and old records: rate limits, sessions, codes, speed timings, job history, usage counts, sent-email copies,
 * handled incidents, old events and logs. Cheap, and safe to run any time, so it doesn't wait for the backup.
 */
export async function cleanupRecords(t = now(), until = Date.now() + PURGE_BUDGET_MS) {
  // Rate limits look back at most 24h, so IP addresses aren't kept longer than 48h.
  await q.run("DELETE FROM rate_events WHERE created_at < ?", t - 2 * DAY);
  await q.run("DELETE FROM sessions WHERE expires_at < ?", t);
  await q.run("DELETE FROM password_resets WHERE expires_at < ?", t - DAY);
  await q.run("DELETE FROM login_codes WHERE expires_at < ?", t);
  await q.run("DELETE FROM handle_history WHERE expires_at < ?", t);
  await q.run("DELETE FROM tap_timings WHERE created_at < ?", t - 30 * DAY);
  await q.run("DELETE FROM job_runs WHERE started_at < ?", t - 90 * DAY);
  await q.run("DELETE FROM feature_use WHERE day < ?", new Date(t - 400 * DAY).toISOString().slice(0, 10));
  const removed = {
    emails: await deleteInBatches("outbox", "created_at < ?", [t - KEEP_DAYS.outbox * DAY], until),
    incidents: await deleteInBatches("incidents", "created_at < ? AND (resolved_at IS NOT NULL OR kind = 'upload_rejected')", [t - KEEP_DAYS.incidents * DAY], until),
    events: await deleteInBatches("events", "created_at < ?", [t - KEEP_DAYS.events * DAY], until),
    accountLog: await deleteInBatches("account_log", "created_at < ?", [t - KEEP_DAYS.account_log * DAY], until),
    adminLog: await deleteInBatches("admin_log", "created_at < ?", [t - KEEP_DAYS.admin_log * DAY], until),
    shareAccess: await deleteInBatches("share_access", "created_at < ?", [t - KEEP_DAYS.share_access * DAY], until),
  };
  return removed;
}

export async function purgeExpired({ force = false } = {}) {
  const g = globalThis as typeof globalThis & { __floortestPurgeAt?: number };
  const t = now();
  const until = Date.now() + PURGE_BUDGET_MS;
  if (!force && g.__floortestPurgeAt && t - g.__floortestPurgeAt < 10 * 60_000) return { expired: 0, abandoned: 0 };
  g.__floortestPurgeAt = t;

  // Opportunistic runs (and the start of the nightly one) clear the cheap stuff; the nightly route already ran
  // cleanupRecords before its backup, so it isn't repeated there.
  if (!force) await cleanupRecords(t, until);

  const abandoned = await q.all<{ id: string; file_key: string }>("SELECT id, file_key FROM uploads WHERE created_at < ? LIMIT 500", t - UPLOAD_TTL);
  if (abandoned.length)
    await q.tx(async (db) => {
      await queueDeletion(db, abandoned.map((u) => u.file_key), "upload abandoned", t);
      await db.run(`DELETE FROM uploads WHERE id IN (${abandoned.map(() => "?").join(",")})`, ...abandoned.map((u) => u.id));
    });

  // Retention deletes people's tracks, so it only runs from the nightly job, right after a successful backup.
  if (!force) {
    await drainNow();
    return { expired: 0, abandoned: abandoned.length, deletions: null };
  }
  // Past retention, 200 at a time (one transaction each), until none are left or the time budget is used.
  const due = `deleted_at IS NULL AND ((decision IS NULL AND created_at < ?) OR (decision = 'passed' AND decided_at < ?))`;
  const dueArgs = [t - RETAIN_UNREVIEWED_DAYS * DAY, t - RETAIN_PASSED_DAYS * DAY];
  let expired = 0;
  for (;;) {
    const batch = await q.all<{ id: number }>(`SELECT id FROM tracks WHERE ${due} ORDER BY id LIMIT 200`, ...dueArgs);
    if (!batch.length) break;
    const ids = batch.map((b) => b.id);
    const marks = ids.map(() => "?").join(",");
    await q.tx(async (db) => {
      await retireTrackFiles(db, ids, "retention");
      await db.run(`UPDATE tracks SET deleted_at = ?, file_key = NULL WHERE id IN (${marks})`, t, ...ids);
      await db.run(
        `INSERT INTO events (user_id, sender_id, track_id, type, detail, created_at) SELECT user_id, sender_id, id, 'expired', '', ? FROM tracks WHERE id IN (${marks})`,
        t,
        ...ids,
      );
    });
    expired += ids.length;
    if (batch.length < 200 || Date.now() > until) break;
  }
  const deletions = await drainNow();
  const left = await q.count(`SELECT COUNT(*) AS n FROM tracks WHERE ${due}`, ...dueArgs);
  // deletions: files removed from storage tonight; left: tracks past retention still waiting (only if time ran out)
  return { expired, abandoned: abandoned.length, left, deletions };
}
