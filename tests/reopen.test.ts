import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-reopen-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const DAY = 86_400_000;

test("a link only moves off a closed collection when the receiver turned that on", async () => {
  const { q } = await import("../src/lib/db");
  const { rerouteClosedLinks } = await import("../src/lib/reopen");
  const now = Date.now();
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, tz, created_at) VALUES ('r@x.io','h','Rae','rae','UTC',?) RETURNING id",
    now,
  ))!.id;
  const closed = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, closes_at, created_at) VALUES (?, 'Old callout', ?, ?) RETURNING id", uid, now - DAY, now - 9 * DAY))!.id;
  const open = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Next callout', ?) RETURNING id", uid, now - DAY))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", closed, uid);
  const active = async () => (await q.get<{ id: number }>("SELECT active_collection_id AS id FROM users WHERE id = ?", uid))!.id;

  // Off (the default): the closing date stands, the link stays put.
  assert.equal(await rerouteClosedLinks(now), 0);
  assert.equal(await active(), closed);

  // On: the link moves to the open collection, and it's logged on the account.
  await q.run("UPDATE users SET reroute_closed = 1 WHERE id = ?", uid);
  assert.equal(await rerouteClosedLinks(now), 1);
  assert.equal(await active(), open);
  assert.ok(await q.get("SELECT 1 FROM account_log WHERE user_id = ? AND action = 'link_rerouted'", uid));
});
