import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and a gated site, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-invite-gate-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.SITE_PASSWORD = "gate-test-only";
delete process.env.VERCEL_ENV;
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const SITE = "https://floortest.app";
const GOOD = "FLOOR-GATE234567";

async function invite(code: string, query = "") {
  const { GET } = await import("../src/app/invite/[code]/route");
  return GET(new Request(`${SITE}/invite/${code}${query}`), { params: Promise.resolve({ code }) } as RouteContext<"/invite/[code]">);
}

test("a live personal invite link gives a one-day pass and opens sign-up; anything else gets Coming soon", async () => {
  const { q } = await import("../src/lib/db");
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES (?, 1, '', 'gate@x.io', ?)", GOOD, Date.now());
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES ('FLOOR-OLD789', 1, '', 'old@x.io', ?)", Date.now());

  const ok = await invite(GOOD, `?invite=${GOOD}&handle=eve`);
  assert.equal(ok.status, 307);
  const to = new URL(ok.headers.get("location")!);
  assert.equal(to.pathname, "/signup");
  assert.equal(to.searchParams.get("invite"), GOOD);
  assert.equal(to.searchParams.get("handle"), "eve", "the handle from the email rides along");
  const cookie = ok.headers.get("set-cookie") ?? "";
  assert.match(cookie, /ft_gate=/);
  assert.match(cookie, /Max-Age=86400/, "the invite's pass lasts a day, not the 30 days a sign-in gives");
  assert.match(cookie, /HttpOnly/i);

  for (const code of ["FLOOR-NOPE234567", "FLOOR-OLD789", "' OR 1=1 --"]) {
    const no = await invite(code);
    assert.equal(new URL(no.headers.get("location")!).pathname, "/coming-soon", code);
    assert.equal(no.headers.get("set-cookie"), null, `${code} gets no pass`);
  }
});

test("guessing is capped: after 20 tries in ten minutes even a good code gets Coming soon", async () => {
  const { q } = await import("../src/lib/db");
  await q.run("DELETE FROM rate_events WHERE bucket = 'invite-gate'");
  for (let i = 0; i < 20; i++) await invite(`FLOOR-GUESS${String(i).padStart(5, "0")}`);
  const capped = await invite(GOOD);
  assert.equal(new URL(capped.headers.get("location")!).pathname, "/coming-soon");
  assert.equal(capped.headers.get("set-cookie"), null);
});

test("the gate sends invite emails' sign-up links to the invite check and keeps everything else behind the password", async () => {
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("../src/proxy");
  const go = (p: string) => proxy(new NextRequest(`${SITE}${p}`));

  const old = go(`/signup?invite=${GOOD}&handle=eve`);
  assert.equal(old.status, 307, "links in invites already sent still work");
  const to = new URL(old.headers.get("location")!);
  assert.equal(to.pathname, `/invite/${GOOD}`);
  assert.equal(to.searchParams.get("handle"), "eve");

  assert.equal(go(`/invite/${GOOD}`).headers.get("x-middleware-rewrite"), null, "the invite check itself is open");
  for (const p of ["/signup", "/pricing", "/dashboard/floor"])
    assert.match(go(p).headers.get("x-middleware-rewrite") ?? "", /\/coming-soon/, `${p} stays behind the password`);
});
