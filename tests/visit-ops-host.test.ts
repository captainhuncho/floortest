import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database, and an ops site on its own host, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-visit-ops-host-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.APP_URL = "https://floortest.test";
process.env.OPS_URL = "https://ops.floortest.test";
delete process.env.DATABASE_URL;

test("the ops host never counts, and writes nothing", async () => {
  const { q } = await import("../src/lib/db");
  const { POST } = await import("../src/app/api/visit/route");
  const post = (host: string) =>
    POST(
      new Request(`https://${host}/api/visit`, {
        method: "POST",
        headers: { host, "content-type": "application/json", "sec-fetch-site": "same-origin", "x-real-ip": "8.8.8.8" },
        body: JSON.stringify({ kind: "visit", path: "/" }),
      }),
    );
  const res = await post("ops.floortest.test");
  assert.equal(res.status, 204);
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM visit_counts"))!.n, 0);
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM rate_events"))!.n, 0, "no rate-limit slot taken");
  await post("floortest.test");
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM visit_counts"))!.n, 1, "the public host still counts");
});
