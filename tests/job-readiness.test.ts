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
  assert.deepEqual(await jobProblems(later), ["Nightly backup and clean-up has never run", "Daily emails has never run"]);
  await recordRun("purge", later, true, {});
  await recordRun("digest", later, false, { error: "x" });
  const after = await jobProblems(later + 1000);
  assert.equal(after.length, 1, "the backup ran fine; the emails failed");
  assert.match(after[0], /^Daily emails failed on /);
});
