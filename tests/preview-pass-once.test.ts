import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-preview-once-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// The 60-second pass from ops opens a draft preview once, like a view-as ticket: a copied or replayed link is refused.
test("a draft-preview pass works once", async () => {
  const { previewPass, redeemPass } = await import("../src/lib/draft-preview");
  const me = { adminId: 7, session: "a".repeat(64) };
  const pass = previewPass(me);
  assert.deepEqual(await redeemPass(pass), me);
  assert.equal(await redeemPass(pass), null, "used already");
  assert.deepEqual(await redeemPass(previewPass(me)), me, "a fresh pass from ops still works");
  assert.equal(await redeemPass("7.nope.1.x"), null, "a forged pass is refused without being recorded");
  const [, , , sig] = pass.split(".");
  assert.equal(await redeemPass(pass.replace(sig, "x".repeat(sig.length))), null);
});

test("the draft-preview route spends the pass", () => {
  const src = fs.readFileSync(new URL("../src/app/api/draft-preview/route.ts", import.meta.url), "utf8");
  assert.match(src, /await redeemPass\(/);
  assert.doesNotMatch(src, /passHolder\(/);
});
