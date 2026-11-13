import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-admin-log-kept-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// Owner, 6 Nov: "No admin can delete admin logs." The nightly clean-up deletes old logs of other kinds, never these.
test("nightly clean-up keeps admin log lines however old", async () => {
  const { q } = await import("../src/lib/db");
  const { cleanupRecords } = await import("../src/lib/retention");
  const t = Date.now();
  const tenYears = 10 * 365 * 24 * 3_600_000;

  await q.run("INSERT INTO admin_log (admin_id, action, target, created_at) VALUES (NULL, 'suspended', '@old', ?)", t - tenYears);
  await q.run("INSERT INTO admin_log (admin_id, action, target, created_at) VALUES (NULL, 'suspended', '@new', ?)", t - 1_000);

  await cleanupRecords(t);

  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM admin_log WHERE target IN ('@old', '@new')"), 2);
});
