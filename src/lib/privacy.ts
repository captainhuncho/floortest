import "server-only";
import { now, q } from "@/lib/db";
import { accountKeys, drainNow, queueDeletion, trackKeys } from "@/lib/deletion";
import { forgetLinkPerson, linkDataFor } from "@/lib/share-links";
import { DELETED_HANDLE_HOLD_DAYS } from "@/lib/accounts";
import { normalEmail } from "./email-normal";

/**
 * Deletes an account and everything it owns. Every file (audio, stems, unfinished uploads, cover) is queued
 * for deletion in the same transaction that removes the rows, so none is lost if storage is slow or down.
 */
export async function purgeAccount(userId: number) {
  await q.tx(async (db) => {
    await queueDeletion(db, await accountKeys(db, userId), `account #${userId} deleted`, now());
    const who = await db.get<{ email: string }>("SELECT email FROM users WHERE id = ?", userId);
    if (who) await forgetLinkPerson(db, userId, who.email);
    // Its link, and old links it still held, stay reserved: the delete below cascades the old ones away.
    const t = now();
    await db.run(
      `INSERT INTO released_handles (handle, released_at, expires_at)
       SELECT handle, ?::bigint, ?::bigint FROM users WHERE id = ? UNION SELECT old_handle, ?::bigint, ?::bigint FROM handle_history WHERE user_id = ?
       ON CONFLICT (handle) DO UPDATE SET released_at = excluded.released_at, expires_at = GREATEST(released_handles.expires_at, excluded.expires_at)`,
      t, t + DELETED_HANDLE_HOLD_DAYS * 86_400_000, userId, t, t + DELETED_HANDLE_HOLD_DAYS * 86_400_000, userId,
    );
    await db.run("DELETE FROM users WHERE id = ?", userId); // cascades to everything the account owns
  });
  await drainNow();
}

/** Everything held about one email address as a sender, an account, or a person who wrote in. */
export async function dataFor(email: string) {
  const e = normalEmail(email);
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
  // Review Together: comments this person wrote on teammates' tracks.
  const comments = account
    ? await q.all<Record<string, unknown>>(
        "SELECT t.title AS track, c.body, c.created_at FROM track_comments c JOIN tracks t ON t.id = c.track_id WHERE c.user_id = ? ORDER BY c.created_at",
        account.id,
      )
    : [];
  // Collection share links: lists this address is on, what it opened, played or downloaded, and requests to join.
  const shareLinks = await linkDataFor(e, account ? Number(account.id) : null);
  // Account teams: teams this person is on, invites sent to this address, and replies they wrote that waited for approval.
  const teams = {
    memberOf: account
      ? await q.all<Record<string, unknown>>(
          "SELECT u.name AS account, u.handle, m.role, m.created_at AS joined_at FROM account_members m JOIN users u ON u.id = m.account_id WHERE m.user_id = ? ORDER BY m.created_at",
          account.id,
        )
      : [],
    invites: await q.all<Record<string, unknown>>(
      "SELECT u.name AS account, i.role, i.created_at, i.expires_at, i.accepted_at, i.revoked_at FROM account_invites i JOIN users u ON u.id = i.account_id WHERE i.email = ? ORDER BY i.created_at",
      e,
    ),
    heldReplies: account
      ? await q.all<Record<string, unknown>>(
          "SELECT u.name AS account, h.body, h.status, h.created_at, h.decided_at FROM held_replies h JOIN users u ON u.id = h.account_id WHERE h.author_id = ? ORDER BY h.created_at",
          account.id,
        )
      : [],
  };
  const newsletter = await q.get<Record<string, unknown>>("SELECT email, marketing, source, created_at FROM newsletter_subscribers WHERE lower(email) = ?", e);
  return { email: e, account, sent, messages, emails, waitlist, newsletter, reopenAlerts, comments, shareLinks, teams };
}

/**
 * Erases someone as a sender: their sender records and the tracks they sent (files and stems), plus their messages,
 * waitlist and newsletter entries, reopen requests and every email to them.
 */
export async function eraseSender(email: string) {
  const e = normalEmail(email);
  const r = await q.tx(async (db) => {
    const ids = (await db.all<{ id: number }>("SELECT t.id FROM tracks t JOIN senders s ON s.id = t.sender_id WHERE lower(s.email) = ?", e)).map((x) => x.id);
    const files = await queueDeletion(db, await trackKeys(db, ids), "sender erased", now());
    const gone = await db.run("DELETE FROM senders WHERE lower(email) = ?", e); // cascades to their tracks and stems
    await db.run("DELETE FROM contact_messages WHERE lower(email) = ?", e);
    await db.run("DELETE FROM waitlist WHERE lower(email) = ?", e);
    await db.run("DELETE FROM reopen_alerts WHERE lower(email) = ?", e);
    await db.run("DELETE FROM sender_links WHERE lower(email) = ?", e);
    // Their emails (queued or sent) and their newsletter entry went too (Batch C, 28 Oct). The unsubscribe list
    // (email_suppressions) stays: it is what keeps us from emailing them again.
    await db.run("DELETE FROM outbox WHERE lower(to_email) = ?", e);
    await db.run("DELETE FROM newsletter_subscribers WHERE lower(email) = ?", e);
    return { senders: gone.changes, files };
  });
  await drainNow();
  return r;
}
