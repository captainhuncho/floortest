import "server-only";
import { now, q } from "@/lib/db";
import { accountKeys, drainNow, queueDeletion, trackKeys } from "@/lib/deletion";

/**
 * Deletes an account and everything it owns. Every file (audio, stems, unfinished uploads, cover) is queued
 * for deletion in the same transaction that removes the rows, so none is lost if storage is slow or down.
 */
export async function purgeAccount(userId: number) {
  await q.tx(async (db) => {
    await queueDeletion(db, await accountKeys(db, userId), `account #${userId} deleted`, now());
    await db.run("DELETE FROM users WHERE id = ?", userId); // cascades to everything the account owns
  });
  await drainNow();
}

/** Everything held about one email address as a sender, an account, or a person who wrote in. */
export async function dataFor(email: string) {
  const e = email.trim().toLowerCase();
  const account = await q.get<Record<string, unknown>>(
    "SELECT id, name, handle, email, plan, created_at, email_verified_at, tz, suspended_at, suspended_reason FROM users WHERE lower(email) = ?",
    e,
  );
  const sent = await q.all<Record<string, unknown>>(
    `SELECT s.id AS sender_id, s.name, s.email, s.created_at, u.handle AS sent_to, t.title, t.artist, t.message, t.genre, t.created_at AS sent_at, t.decision, t.deleted_at
     FROM senders s JOIN users u ON u.id = s.user_id LEFT JOIN tracks t ON t.sender_id = s.id WHERE lower(s.email) = ? ORDER BY s.id, t.created_at`,
    e,
  );
  const messages = await q.all<Record<string, unknown>>("SELECT topic, message, created_at FROM contact_messages WHERE lower(email) = ? ORDER BY created_at", e);
  const emails = await q.all<Record<string, unknown>>("SELECT subject, status, created_at FROM outbox WHERE lower(to_email) = ? ORDER BY created_at", e);
  const waitlist = await q.get<Record<string, unknown>>("SELECT email, handle, created_at, invited_at FROM waitlist WHERE lower(email) = ?", e);
  const reopenAlerts = await q.all<Record<string, unknown>>(
    "SELECT u.handle AS link, r.created_at, r.sent_at FROM reopen_alerts r JOIN users u ON u.id = r.user_id WHERE lower(r.email) = ? ORDER BY r.created_at",
    e,
  );
  return { email: e, account, sent, messages, emails, waitlist, reopenAlerts };
}

/** Erases someone as a sender: their sender records and the tracks they sent (files and stems), plus their messages and waitlist entry. */
export async function eraseSender(email: string) {
  const e = email.trim().toLowerCase();
  const r = await q.tx(async (db) => {
    const ids = (await db.all<{ id: number }>("SELECT t.id FROM tracks t JOIN senders s ON s.id = t.sender_id WHERE lower(s.email) = ?", e)).map((x) => x.id);
    const files = await queueDeletion(db, await trackKeys(db, ids), "sender erased", now());
    const gone = await db.run("DELETE FROM senders WHERE lower(email) = ?", e); // cascades to their tracks and stems
    await db.run("DELETE FROM contact_messages WHERE lower(email) = ?", e);
    await db.run("DELETE FROM waitlist WHERE lower(email) = ?", e);
    await db.run("DELETE FROM reopen_alerts WHERE lower(email) = ?", e);
    return { senders: gone.changes, files };
  });
  await drainNow();
  return r;
}
