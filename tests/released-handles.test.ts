import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = testDataDir("ft-released-handles-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("a deleted account's link, and old links it still held, stay reserved", async () => {
  const { q } = await import("../src/lib/db");
  const { handleHeld } = await import("../src/lib/accounts");
  const { purgeAccount } = await import("../src/lib/privacy");
  const t = Date.now();
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('gone@x.io', 'h', 'Gone', 'gonedj', 'pro', 'UTC', ?, ?) RETURNING id",
    t, t,
  ))!.id;
  await q.run("INSERT INTO handle_history (old_handle, user_id, forward, created_at, expires_at) VALUES ('olddj', ?, 1, ?, ?)", id, t, t + 86_400_000);
  assert.equal(await handleHeld("gonedj"), false, "a live account's own handle isn't a reservation");
  await purgeAccount(id);
  assert.equal(await q.get("SELECT 1 FROM users WHERE id = ?", id), undefined);
  assert.equal(await handleHeld("gonedj"), true, "the deleted account's link can't be claimed");
  assert.equal(await handleHeld("olddj"), true, "nor can a name it gave up recently");
  assert.equal(await handleHeld("freshdj"), false);
});
