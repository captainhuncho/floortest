import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-email-tokens-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const SHA256_HEX = /^[a-f0-9]{64}$/;

async function setup() {
  const { q } = await import("../src/lib/db");
  const { hashToken } = await import("../src/lib/token-hash");
  const t = Date.now();
  const make = async (handle: string, email: string, verified: boolean) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?, ?) RETURNING id", email, handle, handle, t, verified ? t : null))!.id;
  return { q, hashToken, make };
}

test("the email-change link is stored as a hash: the link works, a copy of the stored value doesn't", async () => {
  const { q, hashToken, make } = await setup();
  const { requestEmailChange, confirmEmailChange, pendingEmailFor } = await import("../src/lib/accounts");
  const me = await make("changer", "changer@x.io", true);
  assert.equal(await requestEmailChange(me, "new@x.io", "user"), null);
  const stored = (await q.get<{ t: string }>("SELECT pending_email_token AS t FROM users WHERE id = ?", me))!.t;
  assert.match(stored, SHA256_HEX, "the database holds a hash, not the link");
  assert.equal(await pendingEmailFor(stored), undefined, "the stored value is no use as a link");
  assert.equal(await confirmEmailChange(stored, me), null);
  // The link as the email carried it: a known one, stored the way requestEmailChange stores it.
  await q.run("UPDATE users SET pending_email_token = ? WHERE id = ?", hashToken("link-change-1"), me);
  assert.equal((await confirmEmailChange("link-change-1", me))?.to, "new@x.io", "the link itself completes the change");
});

test("the email confirmation link is looked up by its hash", async () => {
  const { q, hashToken, make } = await setup();
  const { confirmEmail } = await import("../src/lib/accounts");
  const me = await make("fresh", "fresh@x.io", false);
  // Stored the way sendEmailVerification (src/lib/security.ts) stores it: the hash, never the link.
  const stored = hashToken("link-verify-1");
  assert.match(stored, SHA256_HEX);
  await q.run("UPDATE users SET email_verify_token = ? WHERE id = ?", stored, me);
  assert.equal(await confirmEmail(stored, me), undefined, "the stored value is no use as a link");
  assert.deepEqual(await confirmEmail("link-verify-1", me), { id: me }, "the link itself confirms");
});

test("the migration hashes a stored link the same way the app does", async () => {
  const { q, hashToken } = await setup();
  const r = await q.get<{ h: string }>("SELECT encode(sha256(convert_to(?::text, 'UTF8')), 'hex') AS h", "link-verify-1");
  assert.equal(r!.h, hashToken("link-verify-1"));
});
