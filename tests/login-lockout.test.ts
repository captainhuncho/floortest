import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-login-lockout-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.TURNSTILE_SITE_KEY = "site";
process.env.TURNSTILE_SECRET_KEY = "secret";
delete process.env.DATABASE_URL;

test("a stranger's wrong passwords don't lock the owner out: with the human check on, the hard stop is per connection", async () => {
  const { q } = await import("../src/lib/db");
  const { loginLocked, recordLoginFailure } = await import("../src/lib/login-limits");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('bot_check', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", Date.now());
  for (let i = 0; i < 12; i++) await recordLoginFailure("owner@x.io", "6.6.6.6");
  assert.equal(await loginLocked("owner@x.io", "6.6.6.6"), true, "the guessing connection is stopped");
  assert.equal(await loginLocked("owner@x.io", "1.2.3.4"), false, "the owner, elsewhere, can still log in (after the human check)");
  for (let i = 0; i < 20; i++) await recordLoginFailure(`other${i}@x.io`, "7.7.7.7");
  assert.equal(await loginLocked("new@x.io", "7.7.7.7"), true, "one connection trying many emails is stopped");
});

test("with the human check off there is nothing to ask for, so the per-email stop stays", async () => {
  const { q } = await import("../src/lib/db");
  const { loginLocked, recordLoginFailure } = await import("../src/lib/login-limits");
  await q.run("UPDATE switches SET on_ = 0 WHERE key = 'bot_check'");
  for (let i = 0; i < 10; i++) await recordLoginFailure("plain@x.io", `9.9.9.${i}`);
  assert.equal(await loginLocked("plain@x.io", "1.2.3.4"), true);
});
