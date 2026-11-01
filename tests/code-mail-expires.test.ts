import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testDataDir } from "./test-db";

// A throwaway local database, a daily limit of 10 and a fake email provider (fetch is stubbed: nothing is sent).
process.env.DATA_DIR = testDataDir("ft-code-expires-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.RESEND_API_KEY = "re_test_only";
process.env.MAIL_DAILY_LIMIT = "10";
delete process.env.MAIL_RESERVED_SHARE;
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;

const sent: string[] = [];
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  sent.push(JSON.parse(String(init?.body)).subject);
  return new Response(JSON.stringify({ id: `em-${sent.length}` }), { status: 200 });
}) as typeof fetch;

test("a code email past the day's shared part is dropped, not sent after midnight with a dead code", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, deliver } = await import("../src/lib/mail");
  for (let i = 0; i < 7; i++) {
    assert.equal(await deliver(await queueMail({ userId: null, to: `s${i}@x.io`, subject: `Delivered ${i}`, body: "b" })), "sent");
  }
  const late = await queueMail({ userId: null, to: "r@x.io", subject: "Delivered later", body: "b" });
  assert.equal(await deliver(late), "queued (daily limit)", "ordinary email still waits for tomorrow");

  const code = await queueMail({ userId: null, to: "c@x.io", subject: "123456 is your FloorTest code", body: "123456", secrets: ["123456"], expires: true });
  assert.equal(await deliver(code), "dropped (daily limit)");
  const row = await q.get<{ status: string; payload: string | null; next_at: number | null }>("SELECT status, payload, next_at FROM outbox WHERE id = ?", code);
  assert.equal(row!.status, "dropped (daily limit)");
  assert.equal(row!.payload, null, "nothing left to send later");
  assert.equal(row!.next_at, null, "not due again");
  assert.ok(!sent.includes("123456 is your FloorTest code"));
});

test("a code email's send status becomes the message the person waiting sees", async () => {
  const { codeMailProblem } = await import("../src/lib/code-mail");
  assert.equal(codeMailProblem("sent"), null);
  assert.equal(codeMailProblem("logged (no RESEND_API_KEY)"), null);
  assert.match(codeMailProblem("dropped (daily limit)") ?? "", /can't send codes right now/);
  assert.match(codeMailProblem("queued (daily limit)") ?? "", /can't send codes right now/);
  assert.match(codeMailProblem("skipped (bounced before)") ?? "", /bounced before/);
  assert.match(codeMailProblem("failed (500)") ?? "", /didn't go through/);
});

test("sender codes and share-link codes are sent as expiring email", () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const sender = read("src/lib/sender-code.ts");
  assert.match(sender, /expires: true/, "sender codes expire");
  assert.match(sender, /codeMailProblem\(/, "and the sender is told when one didn't go");
  // The share-link code answers the same whether or not the address is on the list, so it can't show a send error
  // (that would say the address is listed); its late email is just dropped.
  const share = read("src/app/c/[token]/actions.ts");
  assert.match(share, /expires: true/, "share-link codes expire");
  assert.doesNotMatch(share, /codeMailProblem\(/, "and say nothing extra about listed addresses");
});
