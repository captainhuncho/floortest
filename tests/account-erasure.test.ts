import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-account-erasure-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.S3_BUCKET;

const t = Date.now();

// Hardening H77 (29 Oct): deleting an account also removes what is held under its email address, as erasing a sender does.
test("deleting an account removes its messages, partner note, waitlist, newsletter and reopen entries and emails to it", async () => {
  const { q } = await import("../src/lib/db");
  const { purgeAccount } = await import("../src/lib/privacy");
  const user = async (email: string, handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', 'R', ?, 'pro', 'UTC', ?, ?) RETURNING id",
      email, handle, t, t,
    ))!.id;
  const gone = await user("Gone@Erase.io", "goneacct");
  const other = await user("other@erase.io", "otheracct");
  const e = "gone@erase.io";
  await q.run("INSERT INTO contact_messages (user_id, name, email, topic, message, created_at) VALUES (?, 'G', ?, 'help', 'hi', ?)", gone, e, t);
  await q.run("INSERT INTO contact_messages (user_id, name, email, topic, message, created_at) VALUES (NULL, 'G', 'GONE@erase.io', 'help', 'before signing up', ?)", t);
  await q.run("INSERT INTO partner_notes (email, note, updated_at) VALUES (?, 'label contact', ?)", e, t);
  await q.run("INSERT INTO waitlist (email, created_at) VALUES (?, ?)", e, t);
  await q.run("INSERT INTO newsletter_subscribers (email, token, created_at) VALUES (?, 'nl-tok-acct', ?)", e, t);
  await q.run("INSERT INTO reopen_alerts (user_id, email, created_at) VALUES (?, ?, ?)", other, e, t);
  await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at) VALUES (?, ?, 'Invite', 'b', 'sent', 'sender', ?)", other, e, t);
  await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at) VALUES (NULL, ?, 'Old code', 'b', 'failed', 'support', ?)", e, t);
  // The "your account was deleted" email is queued just before the purge and must still go out.
  await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at) VALUES (NULL, ?, 'Your FloorTest account was deleted', 'b', 'queued', 'support', ?)", e, t);
  // Records that stay: the unsubscribe list, and other people's rows.
  await q.run("INSERT INTO email_suppressions (email, reason, created_at) VALUES (?, 'bounced', ?)", e, t);
  await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at) VALUES (?, 'other@erase.io', 'Hi', 'b', 'sent', 'sender', ?)", other, t);
  await q.run("INSERT INTO partner_notes (email, note, updated_at) VALUES ('other@erase.io', 'keep', ?)", t);

  await purgeAccount(gone);

  const left = (sql: string) => q.count(sql, e);
  assert.equal(await left("SELECT COUNT(*) AS n FROM contact_messages WHERE lower(email) = ?"), 0, "messages");
  assert.equal(await left("SELECT COUNT(*) AS n FROM partner_notes WHERE lower(email) = ?"), 0, "partner note");
  assert.equal(await left("SELECT COUNT(*) AS n FROM waitlist WHERE lower(email) = ?"), 0, "waitlist");
  assert.equal(await left("SELECT COUNT(*) AS n FROM newsletter_subscribers WHERE lower(email) = ?"), 0, "newsletter");
  assert.equal(await left("SELECT COUNT(*) AS n FROM reopen_alerts WHERE lower(email) = ?"), 0, "reopen alerts");
  assert.deepEqual(
    (await q.all<{ subject: string }>("SELECT subject FROM outbox WHERE lower(to_email) = ?", e)).map((r) => r.subject),
    ["Your FloorTest account was deleted"],
    "only the goodbye email still waiting to send",
  );
  assert.equal(await left("SELECT COUNT(*) AS n FROM email_suppressions WHERE email = ?"), 1, "the unsubscribe list stays");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM outbox WHERE to_email = 'other@erase.io'"), 1);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM partner_notes WHERE email = 'other@erase.io'"), 1);
});
