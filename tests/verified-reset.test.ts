import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-verified-reset-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("the Verified mark goes when the link it was checked against changes", async () => {
  const { q } = await import("../src/lib/db");
  const { changeHandle, resetVerified } = await import("../src/lib/accounts");
  const t = Date.now();
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at, identity_status, identity_verified_at) VALUES ('v@x.io', 'h', 'Real DJ', 'realdj', 'pro', 'UTC', ?, ?, 'verified', ?) RETURNING id",
    t, t, t,
  ))!.id;
  const status = async () => (await q.get<{ s: string; at: number | null }>("SELECT identity_status AS s, identity_verified_at AS at FROM users WHERE id = ?", id))!;
  assert.equal(await changeHandle(id, "realdj"), null, "keeping the same link changes nothing");
  assert.equal((await status()).s, "verified");
  assert.equal(await changeHandle(id, "famousdj"), null);
  assert.deepEqual(await status(), { s: "rejected", at: null }, "a new link needs checking again");
  assert.equal(await resetVerified(q, id), false, "only a verified account is reset");
});
