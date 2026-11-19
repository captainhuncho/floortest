import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Neon suspends the database after 5 idle minutes, and every cron run touches it. The 5- and 10-minute jobs kept it
// awake around the clock and used up the month's compute on 17 Nov (site down). The frequent jobs share one schedule
// (one wake-up instead of two) and none runs more often than every 15 minutes, so it sleeps between runs.
const crons: { path: string; schedule: string }[] = JSON.parse(fs.readFileSync("vercel.json", "utf8")).crons;

test("the frequent cron jobs run together, at most every 15 minutes", () => {
  const frequent = crons.filter((c) => c.schedule.split(" ")[1] === "*");
  assert.deepEqual(frequent.map((c) => c.path).sort(), ["/api/cron/mail", "/api/cron/scan-held"]);
  assert.equal(new Set(frequent.map((c) => c.schedule)).size, 1, "same minutes, so the database wakes once");
  const minutes = frequent[0].schedule.split(" ")[0];
  const step = /^\*\/(\d+)$/.exec(minutes);
  assert.ok(step && Number(step[1]) >= 15, `runs every ${minutes} minutes`);
});
