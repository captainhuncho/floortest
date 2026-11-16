import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-collections-beta-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("callouts have no cap: a desk starts as many as it wants (owner, 16 Nov)", async () => {
  const { q } = await import("../src/lib/db");
  const { addCollection } = await import("../src/lib/desk");
  const t = Date.now();
  const desk = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('d@x.io', 'h', 'D', 'dd', 'free', 'UTC', ?) RETURNING id", t))!.id;
  const made = await Promise.all(["One", "Two", "Three", "Four", "Five"].map((n) => addCollection(desk, n)));
  assert.equal(made.filter((id) => Number.isSafeInteger(id)).length, 5, "every create gets an id, even at the same instant");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?", desk), 5);
});
