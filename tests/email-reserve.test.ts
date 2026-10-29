import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and a small daily send limit, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-email-reserve-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.MAIL_DAILY_LIMIT = "10";
delete process.env.MAIL_RESERVED_SHARE;
delete process.env.ACCOUNT_EMAIL_CAP;
delete process.env.DATABASE_URL;

test("email to strangers stops before the daily limit, keeping a share for sign-in codes and resets", async () => {
  const { q } = await import("../src/lib/db");
  const { accountEmailAllowed, ACCOUNT_EMAIL_CAP, PUBLIC_EMAIL_DAY } = await import("../src/lib/email-budget");
  const { sendCode, CodeError } = await import("../src/lib/sender-code");
  assert.equal(PUBLIC_EMAIL_DAY, 7, "70% of a daily limit of 10; 30% is kept for account emails");
  assert.ok(ACCOUNT_EMAIL_CAP <= 20, "the hourly cap follows the daily limit, not a fixed 300");
  const t = Date.now();
  // 7 of today's 10 already handed to the provider.
  for (let i = 0; i < 7; i++)
    await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at, last_attempt_at, attempts) VALUES (NULL, ?, 's', 'b', 'sent', 'sender', ?, ?, 1)", `old${i}@x.io`, t, t);
  assert.equal(await accountEmailAllowed("public"), false, "anonymous codes and links are refused");
  await assert.rejects(sendCode("stranger@x.io", "9.9.9.9", "human"), CodeError, "a sender code isn't sent");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM outbox WHERE to_email = 'stranger@x.io'"), 0);
  assert.equal(await accountEmailAllowed(), true, "a sign-in code or reset still goes");
});

test("a sender code can be resent only twice per bot check", async () => {
  const { q } = await import("../src/lib/db");
  const { sendCode, canResend, CodeError } = await import("../src/lib/sender-code");
  await q.run("DELETE FROM outbox");
  await sendCode("again@x.io", "8.8.8.8", "human");
  assert.equal(await canResend("again@x.io"), true);
  await sendCode("again@x.io", "8.8.8.8", "resend");
  await sendCode("again@x.io", "8.8.8.8", "resend");
  assert.equal(await canResend("again@x.io"), false, "a third resend needs a fresh bot check");
  await assert.rejects(sendCode("again@x.io", "8.8.8.8", "resend"), CodeError);
  await sendCode("again@x.io", "8.8.8.8", "human");
  assert.equal(await canResend("again@x.io"), true, "a new bot check allows resends again");
});
