import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-receipt-pulse-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("one connection gets 60 receipt checks a minute, then 429 with Retry-After", async () => {
  const { GET } = await import("../src/app/api/pulse/receipt/[token]/route");
  const { record } = await import("../src/lib/ratelimit");
  const ask = (ip: string) =>
    GET(new Request("http://localhost/api/pulse/receipt/tok", { headers: { "x-real-ip": ip } }), { params: Promise.resolve({ token: "tok" }) } as RouteContext<"/api/pulse/receipt/[token]">);
  // 59 checks already this minute (written directly, so a slow machine can't let early ones age out of the window).
  for (let i = 0; i < 59; i++) await record("receipt_pulse", "8.8.8.8");
  assert.equal((await ask("8.8.8.8")).status, 200, "the 60th check is within the limit");
  const over = await ask("8.8.8.8");
  assert.equal(over.status, 429);
  assert.equal(over.headers.get("retry-after"), "60");
  assert.equal((await ask("8.8.4.4")).status, 200, "another connection is unaffected");
});
