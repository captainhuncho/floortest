import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-jobs-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("a scheduled job that has never run is a problem once a day's window has passed", async () => {
  const { jobProblems, recordRun, LATE_AFTER_MS } = await import("../src/lib/cron");
  const t = Date.now();
  assert.deepEqual(await jobProblems(t), [], "just installed: nothing is due yet");
  const later = t + LATE_AFTER_MS + 60_000;
  assert.deepEqual(await jobProblems(later), ["Nightly backup and clean-up has never run", "Daily emails has never run", "Held uploads virus check has never run"]);
  await recordRun("purge", later, true, {});
  await recordRun("digest", later, false, { error: "x" });
  await recordRun("scan", later, true, {}, { history: false });
  const after = await jobProblems(later + 1000);
  assert.equal(after.length, 1, "the backup ran fine; the emails failed");
  assert.match(after[0], /^Daily emails failed on /);
});

test("the every-10-minutes job is late after an hour, not a day", async () => {
  const { jobProblems, recordRun } = await import("../src/lib/cron");
  const t = Date.now() + 10 * 86_400_000;
  await recordRun("purge", t, true, {});
  await recordRun("digest", t, true, {});
  await recordRun("scan", t, true, {}, { history: false });
  assert.deepEqual(await jobProblems(t + 30 * 60_000), [], "half an hour since the last run is fine");
  const late = await jobProblems(t + 61 * 60_000);
  assert.equal(late.length, 1);
  assert.match(late[0], /^Held uploads virus check hasn't run since /);
});
