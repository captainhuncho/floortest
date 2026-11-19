import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-receipt-pulse-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const load = async () => {
  const { GET } = await import("../src/app/api/pulse/receipt/[token]/route");
  return (ip: string, token: string) =>
    GET(new Request(`http://localhost/api/pulse/receipt/${token}`, { headers: { "x-real-ip": ip } }), { params: Promise.resolve({ token }) } as RouteContext<"/api/pulse/receipt/[token]">);
};
const rateRows = async () => (await import("../src/lib/db")).q.count("SELECT COUNT(*) AS n FROM rate_events");

// Board #17 (19 Nov, owner's yes): the receipt page asks every 8 s, so one link polled faster is refused, and neither an
// allowed nor a refused check writes to the database.
test("one receipt link gets a burst of 5 per connection, then 429 with Retry-After, and no check writes a rate row", async () => {
  const ask = await load();
  const before = await rateRows();
  for (let i = 0; i < 5; i++) assert.equal((await ask("8.8.8.8", "tok-a")).status, 200, `check ${i + 1} of the burst`);
  const over = await ask("8.8.8.8", "tok-a");
  assert.equal(over.status, 429);
  assert.equal(over.headers.get("cache-control"), "no-store");
  assert.ok(Number(over.headers.get("retry-after")) >= 1 && Number(over.headers.get("retry-after")) <= 4, "retry within one 4 s step");
  assert.equal((await ask("8.8.8.8", "tok-b")).status, 200, "another link on the same connection is unaffected");
  assert.equal((await ask("8.8.4.4", "tok-a")).status, 200, "the same link from another connection (the sender's phone and laptop) is unaffected");
  assert.equal(await rateRows(), before, "nothing written for allowed or refused checks");
});

test("one connection still gets 60 checks a minute across links, then 429", async () => {
  const ask = await load();
  for (let i = 0; i < 60; i++) assert.equal((await ask("9.9.9.9", `many-${i}`)).status, 200);
  assert.equal((await ask("9.9.9.9", "many-60")).status, 429, "the 61st check in a burst");
  assert.equal((await ask("9.9.4.4", "many-61")).status, 200, "another connection is unaffected");
});

test("the memory limit refills over time and stays bounded", async () => {
  const { memoryLimit } = await import("../src/lib/memory-limit");
  const lim = memoryLimit(3, 8_000, 100);
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) assert.ok(lim.take("k", t));
  assert.ok(!lim.take("k", t), "burst used up");
  assert.equal(lim.retryAfter("k", t), 8);
  assert.ok(!lim.take("k", t + 7_000), "not yet");
  assert.ok(lim.take("k", t + 8_000), "one more after 8 s");
  assert.ok(!lim.take("k", t + 8_000));
  assert.ok(lim.take("k", t + 8_000 + 3 * 8_000) && lim.take("k", t + 32_000) && lim.take("k", t + 32_000), "refills up to the burst");
  assert.ok(!lim.take("k", t + 32_000), "never past the burst");
  for (let i = 0; i < 250; i++) lim.take(`spray-${i}`, t);
  assert.ok(lim.size() <= 100, "past maxKeys the oldest keys are dropped");
});
