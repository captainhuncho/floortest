import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database, two made-up admins and a fake email provider (fetch is stubbed: nothing is sent).
process.env.DATA_DIR = testDataDir("ft-admin-digest-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.ADMIN_EMAILS = "a@floortest.test,b@floortest.test";
process.env.RESEND_API_KEY = "re_test_only";
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;

const DAY = 86_400_000;
const MONDAY = Date.UTC(2026, 9, 19, 8); // Monday 19 Oct 2026, 08:00 UTC

test("the Monday digest only counts as sent once every admin got it; a failed copy is retried the next day, to that admin only", async () => {
  const sent: string[] = [];
  let failB = true;
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const to = JSON.parse(String(init?.body)).to as string;
    if (to.startsWith("b@") && failB) return new Response("down", { status: 503 });
    sent.push(to);
    return new Response(JSON.stringify({ id: `msg-${sent.length}` }), { status: 200 });
  }) as typeof fetch;
  try {
    const { runAdminDigest } = await import("../src/lib/jobs");
    assert.equal(await runAdminDigest(MONDAY - DAY), false, "not on a Sunday");
    assert.equal(await runAdminDigest(MONDAY), false, "b's copy failed, so the week isn't done");
    assert.deepEqual(sent, ["a@floortest.test"]);

    failB = false;
    assert.equal(await runAdminDigest(MONDAY + DAY), true, "Tuesday's run finishes the round");
    assert.deepEqual(sent, ["a@floortest.test", "b@floortest.test"], "a isn't emailed twice");

    assert.equal(await runAdminDigest(MONDAY + 2 * DAY), false, "nothing more that week");
    assert.equal(await runAdminDigest(MONDAY + 7 * DAY), true, "next Monday sends again");
    assert.equal(sent.length, 4);
  } finally {
    globalThis.fetch = real;
  }
});
