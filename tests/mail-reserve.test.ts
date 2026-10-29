import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database, a daily limit of 10 and a fake email provider (fetch is stubbed: nothing is sent).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-mail-reserve-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.RESEND_API_KEY = "re_test_only";
process.env.MAIL_DAILY_LIMIT = "10";
delete process.env.MAIL_RESERVED_SHARE; // the default: 30% of the day is kept for account email
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;

const sent: string[] = [];
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  sent.push(JSON.parse(String(init?.body)).subject);
  return new Response(JSON.stringify({ id: `em-${sent.length}` }), { status: 200 });
}) as typeof fetch;

test("a burst of receipts stops before the part of the day kept for sign-in and reset email", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, deliver } = await import("../src/lib/mail");
  const results: string[] = [];
  for (let i = 0; i < 10; i++) {
    const id = await queueMail({ userId: null, audience: "sender", to: `s${i}@x.io`, subject: `Delivered ${i}`, body: "Your track was delivered." });
    results.push(await deliver(id));
  }
  assert.deepEqual(results.slice(0, 7), Array(7).fill("sent"), "receipts go until 70% of the day is used");
  assert.deepEqual(results.slice(7), Array(3).fill("queued (daily limit)"), "then they wait for tomorrow");
  assert.equal(sent.length, 7);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM outbox WHERE status = 'queued' AND payload IS NOT NULL"), 3, "kept, ready to send");

  const reset = await queueMail({ userId: null, audience: "receiver", to: "r@x.io", subject: "Reset your FloorTest password", body: "link", reserved: true });
  assert.equal(await deliver(reset), "sent", "a reset still goes");
  const code = await queueMail({ userId: null, audience: "receiver", to: "r@x.io", subject: "123456 is your FloorTest sign-in code", body: "123456", reserved: true });
  assert.equal(await deliver(code), "sent", "and so does a sign-in code");
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM outbox WHERE reserved = 1"), 2, "the reserve is recorded on the row");
});
