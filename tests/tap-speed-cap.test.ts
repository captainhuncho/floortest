import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-tap-speed-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("one connection can't flood the speed timings table", async () => {
  const { q } = await import("../src/lib/db");
  const { POST } = await import("../src/app/api/tap-speed/route");
  const items = Array.from({ length: 30 }, () => ({ kind: "tap", path: "/dashboard/floor", target: "Keep", ms: 80 }));
  const beacon = () => POST(new Request("http://localhost/api/tap-speed", { method: "POST", headers: { "x-real-ip": "9.9.9.9" }, body: JSON.stringify({ device: "phone", browser: "Safari", items }) }));
  for (let i = 0; i < 15; i++) await beacon();
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM tap_timings"), 10 * 30, "10 beacons a minute, 30 timings each");
});
