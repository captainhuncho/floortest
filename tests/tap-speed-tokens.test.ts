import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-tap-speed-tokens-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// Private links carry a 32-character key; the speed table must keep the page, never the key (Safety item 2, 4 Nov).
const TOKEN = "Ab3dE6gH9jK2mN5pQ8sT1vW4yZ7_c-0x";

async function stored(paths: Record<string, string>) {
  const { q } = await import("../src/lib/db");
  const { POST } = await import("../src/app/api/tap-speed/route");
  const items = Object.entries(paths).map(([target, path]) => ({ kind: "load", path, target, ms: 120 }));
  await POST(new Request("http://localhost/api/tap-speed", { method: "POST", headers: { "x-real-ip": "7.7.7.7" }, body: JSON.stringify({ items }) }));
  const rows = await q.all<{ target: string; path: string }>("SELECT target, path FROM tap_timings");
  return Object.fromEntries(rows.map((r) => [r.target, r.path]));
}

test("private link keys never reach the speed table", async () => {
  const routes = ["c", "join", "confirm-email", "sent/reopen", "receipt", "sent", "verify-email", "reset"];
  const paths = Object.fromEntries(routes.map((r) => [r.replace("/", "-"), `/${r}/${TOKEN}`]));
  const saved = await stored({ ...paths, review: "/dashboard/review", nineteen: "/dashboard/abcdefghij123456789", twenty: "/dashboard/abcdefghij1234567890" });
  for (const r of routes) {
    const path = saved[r.replace("/", "-")];
    assert.ok(path, `/${r} was stored`);
    assert.ok(!path.includes(TOKEN) && !path.includes(TOKEN.slice(0, 12)), `/${r} stored without its key: ${path}`);
    assert.equal(path, `/${r}/:token`);
  }
  assert.equal(saved.review, "/dashboard/review", "a normal page stays readable");
  assert.equal(saved.nineteen, "/dashboard/abcdefghij123456789", "a 19-character segment is kept");
  assert.equal(saved.twenty, "/dashboard/:token", "a 20-character segment is treated as a key");
});
