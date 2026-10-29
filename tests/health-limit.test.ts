import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-health-limit-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.CRON_SECRET = "cron-test-secret";
delete process.env.DATABASE_URL;

// Hardening H14 (29 Oct): the open liveness check can't be used to keep the database busy, and uptime checks still work.
test("open health checks are limited per address; the cron secret and other addresses are not held up", async () => {
  const { GET, HEALTH_PER_MINUTE } = await import("../src/app/api/health/route");
  const hit = (ip: string, auth?: string) => GET(new Request("http://localhost/api/health", { headers: { "x-real-ip": ip, ...(auth ? { authorization: auth } : {}) } }));
  for (let i = 0; i < HEALTH_PER_MINUTE; i++) assert.equal((await hit("5.5.5.5")).status, 200, `check ${i + 1}`);
  const over = await hit("5.5.5.5");
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers.get("retry-after")) > 0);
  assert.equal((await hit("6.6.6.6")).status, 200, "another address");
  assert.notEqual((await hit("5.5.5.5", "Bearer cron-test-secret")).status, 429, "the detailed check with the secret");
  assert.ok(HEALTH_PER_MINUTE >= 6, "an uptime monitor checking every 10 seconds still fits");
});
