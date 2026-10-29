import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Hardening H19 (29 Oct): the coming-soon pass is keyed like everything else signed here, and never with a public fallback.
test("the gate pass is keyed with APP_SECRET and refuses to work without it", async () => {
  const { gateToken } = await import("../src/lib/site-gate");
  const before = process.env.APP_SECRET;
  try {
    process.env.APP_SECRET = "gate-test-".padEnd(40, "z");
    assert.equal(gateToken("pw"), crypto.createHmac("sha256", process.env.APP_SECRET).update("gate:pw").digest("base64url"));
    delete process.env.APP_SECRET;
    assert.throws(() => gateToken("pw"), /APP_SECRET/, "no quiet fallback to a known key");
  } finally {
    if (before === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = before;
  }
});
