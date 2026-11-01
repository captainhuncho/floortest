import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-tap-speed-");
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

// Hardening H16 (29 Oct): one address can only use its share of the daily cap, so it can't blank the speed page for everyone.
test("one address can't spend the whole day's beacon allowance", async () => {
  const { q, now } = await import("../src/lib/db");
  const { POST, BEACONS_PER_IP_A_DAY } = await import("../src/app/api/tap-speed/route");
  for (let i = 0; i < BEACONS_PER_IP_A_DAY; i++) await q.run("INSERT INTO rate_events (bucket, key, created_at) VALUES ('tap_speed_ip_day', '8.8.8.8', ?)", now());
  const items = [{ kind: "tap", path: "/dashboard/floor", target: "Keep", ms: 80 }];
  const send = (ip: string) => POST(new Request("http://localhost/api/tap-speed", { method: "POST", headers: { "x-real-ip": ip }, body: JSON.stringify({ items }) }));
  const before = await q.count("SELECT COUNT(*) AS n FROM tap_timings");
  await send("8.8.8.8");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM tap_timings"), before, "over its share: dropped");
  await send("8.8.4.4");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM tap_timings"), before + 1, "another address still counts");
});
