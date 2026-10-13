import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-sender-code-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

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
