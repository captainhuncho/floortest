import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");

test("recovery codes are stored keyed with the app secret; codes stored the old way still match", async () => {
  const { hashRecovery, matchRecovery } = await import("../src/lib/totp");
  const plainSha = (c: string) => crypto.createHash("sha256").update(c.replace(/[^a-z0-9]/g, "")).digest("hex");
  assert.notEqual(hashRecovery("abcde-fghjk"), plainSha("abcde-fghjk"), "not a bare SHA-256 a database copy could be brute-forced from");
  assert.equal(hashRecovery(" ABCDEFGHJK "), hashRecovery("abcde-fghjk"), "still forgiving about case, spaces and the dash");
  const stored = [plainSha("oldcodexyz"), hashRecovery("newco-dexyz")];
  assert.equal(matchRecovery(stored, "oldco-dexyz"), stored[0], "a code saved before the change still works");
  assert.equal(matchRecovery(stored, "NEWCO DEXYZ"), stored[1]);
  assert.equal(matchRecovery(stored, "wrong-codes"), null);
});
