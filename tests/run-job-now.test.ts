import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-run-job-now-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// Ops → Jobs → Run now (1 Nov): the queue drains run any time; the daily jobs only make up a failed or missed run, so a
// day whose daily emails already went out never gets them twice.
test("Run now's daily-job rule: refused once a run worked since the scheduled time, allowed after a failure or a miss", async () => {
  const { lastScheduled, rerunRefusal } = await import("../src/lib/cron-jobs");
  const { recordRun } = await import("../src/lib/cron");
  const { q } = await import("../src/lib/db");
  const at = (iso: string) => Date.parse(iso);

  // The latest scheduled time at or before now: before 08:00 UTC it is yesterday's daily emails.
  assert.equal(lastScheduled("digest", at("2026-11-01T07:00:00Z")), at("2026-10-31T08:00:00Z"));
  assert.equal(lastScheduled("digest", at("2026-11-01T09:00:00Z")), at("2026-11-01T08:00:00Z"));
  assert.equal(lastScheduled("purge", at("2026-11-01T03:30:00Z")), at("2026-11-01T03:30:00Z"));

  // Queue drains: never refused.
  assert.equal(await rerunRefusal("mail", at("2026-11-01T09:00:00Z")), null);
  assert.equal(await rerunRefusal("scan", at("2026-11-01T09:00:00Z")), null);

  // Never run: allowed.
  assert.equal(await rerunRefusal("digest", at("2026-11-01T09:00:00Z")), null);

  // Yesterday's run worked, today's scheduled one never happened (a missed day): allowed.
  await recordRun("digest", at("2026-10-31T08:00:05Z"), true, { digestsSent: 3 });
  assert.equal(await rerunRefusal("digest", at("2026-11-01T09:00:00Z")), null);
  // …but at 07:00 the latest scheduled time is yesterday's, which worked: refused.
  assert.match((await rerunRefusal("digest", at("2026-11-01T07:00:00Z")))!, /already ran fine at 08:00 UTC/);

  // Today's scheduled run failed: allowed.
  await recordRun("digest", at("2026-11-01T08:00:05Z"), false, { error: "Resend down" });
  assert.equal(await rerunRefusal("digest", at("2026-11-01T09:00:00Z")), null);

  // A make-up run worked: refused, and still refused if a later manual run then failed.
  await recordRun("digest", at("2026-11-01T09:10:00Z"), true, { digestsSent: 3 });
  assert.match((await rerunRefusal("digest", at("2026-11-01T09:30:00Z")))!, /already ran fine at 09:10 UTC/);
  await recordRun("digest", at("2026-11-01T09:40:00Z"), false, { error: "late failure" });
  assert.match((await rerunRefusal("digest", at("2026-11-01T09:50:00Z")))!, /already ran fine/);

  // The backup and clean-up follows the same rule on its own schedule.
  await q.run("DELETE FROM job_runs WHERE job = 'purge'");
  await recordRun("purge", at("2026-11-01T03:30:10Z"), true, {});
  assert.match((await rerunRefusal("purge", at("2026-11-01T12:00:00Z")))!, /already ran fine at 03:30 UTC/);
  assert.equal(await rerunRefusal("purge", at("2026-11-02T04:00:00Z")), null);
});
