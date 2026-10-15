import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-collections-beta-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("a desk holds two collections in the beta; the more_collections switch lifts it", async () => {
  const { q } = await import("../src/lib/db");
  const { canAddCollection, BETA_COLLECTIONS } = await import("../src/lib/desk");
  const t = Date.now();
  const desk = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('d@x.io', 'h', 'D', 'dd', 'free', 'UTC', ?) RETURNING id", t))!.id;
  const add = (name: string) => q.run("INSERT INTO collections (user_id, name, created_at) VALUES (?,?,?)", desk, name, t);

  assert.equal(BETA_COLLECTIONS, 2);
  await add("One");
  assert.equal(await canAddCollection(desk), true, "one collection: room for another");
  await add("Two");
  assert.equal(await canAddCollection(desk), false, "two: the beta limit");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('more_collections', 1, ?)", t);
  assert.equal(await canAddCollection(desk), true, "switched on: no limit");
});
