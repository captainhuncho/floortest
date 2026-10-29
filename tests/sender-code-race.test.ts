import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-sender-code-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
// A made-up key so the code email goes to the (stubbed) email service instead of only being logged.
process.env.RESEND_API_KEY = "test-key-not-real";

test("guesses sent at the same moment can't get past five tries on a sender's email code", async () => {
  const { q } = await import("../src/lib/db");
  const { checkCode } = await import("../src/lib/sender-code");
  // A live code whose value nobody knows; every guess below is wrong.
  await q.run("INSERT INTO sender_codes (email, code_hash, expires_at, attempts, created_at) VALUES ('race@x.io', 'not-a-real-hash-xxxxxxxxxxxxxxxxxxxxxxxxxxx', ?, 0, ?)", Date.now() + 600_000, Date.now());
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => checkCode("race@x.io", String(100000 + i))));
  assert.ok(results.every((r) => r.status === "rejected"));
  const wrongTold = results.filter((r) => r.status === "rejected" && /isn't right/.test(String(r.reason?.message)));
  assert.equal((await q.get<{ attempts: number }>("SELECT attempts FROM sender_codes WHERE email = 'race@x.io'"))!.attempts, 5, "never more than five tries counted");
  assert.equal(wrongTold.length, 4, "tries 1 to 4 are compared and told; the fifth uses it up; the rest are turned away");
});

test("a sender is told when their code email didn't go, instead of waiting for nothing", async () => {
  const { q } = await import("../src/lib/db");
  const { sendCode } = await import("../src/lib/sender-code");
  const realFetch = globalThis.fetch;
  let calls = 0;
  const answer = (ok: boolean) => {
    globalThis.fetch = (async () => {
      calls++;
      return new Response(ok ? JSON.stringify({ id: "re_1" }) : "nope", { status: ok ? 200 : 500 });
    }) as typeof fetch;
  };
  try {
    answer(true);
    await sendCode("ok@x.io", "10.0.0.1");
    assert.equal(calls, 1, "a code that goes is sent once");

    calls = 0;
    answer(false);
    await assert.rejects(sendCode("down@x.io", "10.0.0.2"), /didn't go through/);
    assert.equal(calls, 2, "one more try before telling them");

    calls = 0;
    await q.run("INSERT INTO email_suppressions (email, reason, created_at) VALUES ('gone@x.io', 'bounced', ?)", Date.now());
    answer(true);
    await assert.rejects(sendCode("gone@x.io", "10.0.0.3"), /bounced before/);
    assert.equal(calls, 0, "a bounced address isn't emailed");
  } finally {
    globalThis.fetch = realFetch;
  }
});
