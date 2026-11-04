import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-safe-failure-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// Errors can carry server detail (Safety's review of main 91a0e5c, 4 Nov): it goes to an incident, and what ops sees in
// a message, the admin log or Admin → Jobs is only a reference to it.
const SECRET = 'password=hunter2 host=db.internal relation "users"';
const leaks = (s: unknown) => ["hunter2", "db.internal", 'relation "users"'].filter((w) => JSON.stringify(s ?? "").includes(w));

test("safeFailure keeps the detail in an incident and gives back only a reference", async () => {
  const { safeFailure } = await import("../src/lib/safe-failure");
  const { q } = await import("../src/lib/db");
  const f = await safeFailure(new Error(SECRET), "Checking the audio bucket failed", { path: "/admin/storage" });
  assert.match(f.ref, /^E-[0-9A-F]{8}$/);
  assert.equal(f.error, "failed");
  assert.deepEqual(leaks(f), [], "nothing of the error's own words");
  assert.match(f.message, new RegExp(`Checking the audio bucket failed\\. Reference ${f.ref}`));
  const inc = (await q.get<{ message: string; detail: string }>("SELECT message, detail FROM incidents WHERE message LIKE ?", `%${f.ref}%`))!;
  assert.ok(inc.detail.includes("hunter2"), "the full detail is in the incident, for ops");
  assert.ok(!inc.message.includes("hunter2"), "the incident's title is the plain one");
});

test("a job that fails stores and returns only failed and its reference, never the error", async () => {
  const { q } = await import("../src/lib/db");
  const { RUN_JOB } = await import("../src/lib/cron-jobs");
  // The mail job writes to outbox first: a statement trigger there raises an error carrying secret-looking words.
  await q.run(`CREATE FUNCTION ft_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '${SECRET.replace(/'/g, "''")}'; END $$`);
  await q.run("CREATE TRIGGER ft_boom BEFORE INSERT OR UPDATE OR DELETE ON outbox FOR EACH STATEMENT EXECUTE FUNCTION ft_boom()");
  try {
    const started = Date.now();
    const out = await RUN_JOB.mail(started);
    assert.equal(out.ok, false);
    assert.deepEqual(leaks(out), []);
    const run = (await q.get<{ result: string }>("SELECT result FROM job_runs WHERE job = 'mail' AND started_at = ?", started))!;
    assert.deepEqual(leaks(run.result), [], "job_runs keeps no detail");
    const stored = JSON.parse(run.result) as { error: string; ref: string };
    assert.equal(stored.error, "failed");
    assert.match(stored.ref, /^E-[0-9A-F]{8}$/);
    const latest = (await q.get<{ value: string }>("SELECT value FROM app_state WHERE key = 'last_run_mail'"))!;
    assert.deepEqual(leaks(latest.value), [], "nor the latest-run note Admin → Jobs reads");
    const inc = (await q.get<{ detail: string }>("SELECT detail FROM incidents WHERE message LIKE ?", `%${stored.ref}%`))!;
    assert.ok(inc.detail.includes("hunter2"), "the incident has it");
  } finally {
    await q.run("DROP TRIGGER ft_boom ON outbox");
    await q.run("DROP FUNCTION ft_boom()");
  }
});

test("guard: ops actions, the jobs and the clean-up never show a caught error's own message", () => {
  const files = [path.join(__dirname, "../src/lib/cron-jobs.ts"), path.join(__dirname, "../src/lib/retention.ts")];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(__dirname, "../src/app/admin"));
  const bad = files.filter((f) => /\b(e|err|error)\b(\s+as\s+Error\))?\.message\b/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(bad.map((f) => path.relative(path.join(__dirname, ".."), f)), [], "use safeFailure (src/lib/safe-failure.ts)");
});
