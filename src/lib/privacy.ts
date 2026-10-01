import "server-only";
import { q } from "@/lib/db";
import { storage } from "@/lib/storage";

/** Deletes an account, its files and everything it owns (the database cascades the rest). */
export async function purgeAccount(userId: number) {
  const store = await storage();
  const keys = await q.all<{ k: string }>(
    "SELECT file_key AS k FROM tracks WHERE user_id = ? AND file_key IS NOT NULL UNION SELECT file_key FROM uploads WHERE receiver_id = ?",
    userId,
    userId,
  );
  for (const { k } of keys) await store.delete(k).catch(() => {});
  const cover = await q.get<{ k: string | null }>("SELECT cover_key AS k FROM users WHERE id = ?", userId);
  if (cover?.k) await store.delete(cover.k).catch(() => {});
  await q.run("DELETE FROM users WHERE id = ?", userId);
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
  return { email: e, account, sent, messages, emails, waitlist };
}

/** Erases someone as a sender: their sender records and the tracks they sent (files included), plus their messages and waitlist entry. */
export async function eraseSender(email: string) {
  const e = email.trim().toLowerCase();
  const store = await storage();
  const keys = await q.all<{ k: string }>(
    "SELECT t.file_key AS k FROM tracks t JOIN senders s ON s.id = t.sender_id WHERE lower(s.email) = ? AND t.file_key IS NOT NULL",
    e,
  );
  for (const { k } of keys) await store.delete(k).catch(() => {});
  const r = await q.run("DELETE FROM senders WHERE lower(email) = ?", e); // cascades to their tracks
  await q.run("DELETE FROM contact_messages WHERE lower(email) = ?", e);
  await q.run("DELETE FROM waitlist WHERE lower(email) = ?", e);
  return { senders: r.changes, files: keys.length };
}
