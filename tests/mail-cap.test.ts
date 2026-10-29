import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database, a small daily limit and a fake email provider (fetch is stubbed: nothing is sent).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-mail-cap-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.RESEND_API_KEY = "re_test_only";
process.env.MAIL_DAILY_LIMIT = "10";
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;

const sent: string[] = [];
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  sent.push(JSON.parse(String(init?.body)).to);
  return new Response(JSON.stringify({ id: `em-${sent.length}` }), { status: 200 });
}) as typeof fetch;

test("near the daily send limit, optional email waits for tomorrow and sign-in codes still go", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, deliver } = await import("../src/lib/mail");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('cap@x.io','h','Cap','capdesk','pro','UTC',?,?) RETURNING id",
    t,
    t,
  ))!.id;
  // 8 of today's 10 already sent: 80% used.
  for (let i = 0; i < 8; i++)
    await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at, last_attempt_at, attempts) VALUES (NULL, ?, 's', 'b', 'sent', 'sender', ?, ?, 1)", `old${i}@x.io`, t, t);

  const digest = await queueMail({ userId: uid, to: "cap@x.io", subject: "3 new tracks", body: "d", audience: "receiver", unsubscribe: "submissions" });
  assert.equal(await deliver(digest), "queued (daily limit)");
  const row = (await q.get<{ status: string; next_at: number; attempts: number; payload: string | null }>("SELECT status, next_at, attempts, payload FROM outbox WHERE id = ?", digest))!;
  const d = new Date(t);
  assert.equal(row.status, "queued");
  assert.ok(row.payload, "kept, ready to send");
  assert.equal(row.attempts, 0, "waiting doesn't use up an attempt");
  assert.ok(row.next_at >= Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1), "not before midnight UTC");
  assert.equal(sent.length, 0);

  const code = await queueMail({ userId: uid, to: "cap@x.io", subject: "Your sign-in code", body: "123456", audience: "receiver", secrets: ["123456"], reserved: true });
  assert.equal(await deliver(code), "sent", "sign-in codes and resets always go");

  const nudge = await queueMail({ userId: uid, to: "cap@x.io", subject: "Reminder", body: "n", audience: "receiver", unsubscribe: "alerts" });
  assert.equal(await deliver(nudge), "queued (daily limit)");
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM incidents WHERE message LIKE '%daily send limit%'"), 1, "one notice a day, not one per email");
});
