import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NextRequest } from "next/server";
import { testDataDir } from "./test-db";

// The site lock switch (owner's yes, 13 Nov; Safety's eight points): a throwaway database and a password, set before the
// app's modules load.
process.env.DATA_DIR = testDataDir("ft-site-lock-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.SITE_PASSWORD = "lock-test-only";
delete process.env.VERCEL_ENV;
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const SITE = "https://floortest.app";

async function gate() {
  const g = await import("../src/lib/site-gate");
  g.forgetGateLock();
  return g;
}

/** True when the proxy shows this browser the coming-soon page for a private page. */
async function shownComingSoon(cookie?: string) {
  const { proxy } = await import("../src/proxy");
  const res = await proxy(new NextRequest(`${SITE}/dashboard`, { headers: cookie ? { cookie: `ft_gate=${cookie}` } : {} }));
  return /\/coming-soon/.test(res.headers.get("x-middleware-rewrite") ?? "");
}

let boss: number | undefined;
async function flip(on: boolean) {
  const { setSwitch } = await import("../src/lib/switches");
  if (boss === undefined) {
    const { q, now } = await import("../src/lib/db");
    boss = (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at) VALUES ('lock-boss@example.test', 'h', 'Boss', 'lockboss', 'free', 'dj', 'UTC', ?) RETURNING id",
      now(),
    ))!.id;
  }
  await setSwitch("site_lock", on, boss);
  // updated_at is the generation; make sure two flips in one test never share a millisecond.
  await new Promise((r) => setTimeout(r, 5));
}

test("site_lock is a plain site-wide switch, on until an admin first changes it", async () => {
  const { SWITCHES, isTargeted } = await import("../src/lib/switches");
  assert.equal(SWITCHES.site_lock.initial, true);
  assert.equal(isTargeted("site_lock"), false, "no rule: it acts on visitors without an account");
});

test("never flipped: locked, and a pass made before the switch existed still works", async () => {
  const g = await gate();
  assert.deepEqual(await g.gateLock(), { password: "lock-test-only", gen: "" });
  const old = g.gateToken("lock-test-only");
  assert.equal(await g.hasGatePass(old), true, "passes made before the switch stay good");
  assert.equal(await shownComingSoon(), true);
  assert.equal(await shownComingSoon(old), false);
});

test("off opens the site for everyone; on again voids every old pass", async () => {
  const g = await gate();
  const before = (await g.gatePass())!;
  await flip(false);
  assert.equal(await g.gateLock(), null, "the flip is seen at once in this process");
  assert.equal(await g.gatePass(), null, "nothing to hand out while open");
  assert.equal(await shownComingSoon(), false, "open: no pass needed");
  await flip(true);
  assert.equal(await shownComingSoon(before), true, "a pass from before the re-lock no longer opens it");
  const fresh = (await g.gatePass())!;
  assert.notEqual(fresh, before);
  assert.equal(await shownComingSoon(fresh), false, "a pass made after the re-lock does");
});

test("no SITE_PASSWORD: open whatever the switch says", async () => {
  const before = process.env.SITE_PASSWORD;
  try {
    delete process.env.SITE_PASSWORD;
    await flip(true);
    const g = await gate();
    assert.equal(await g.gateLock(), null);
    assert.equal(await shownComingSoon(), false);
  } finally {
    process.env.SITE_PASSWORD = before;
  }
});

test("the switch can't be read: the site stays locked and no pass works", async () => {
  const g = await gate();
  const good = (await g.gatePass())!;
  const { q } = await import("../src/lib/db");
  const real = q.get;
  const quiet = console.error;
  try {
    q.get = (async () => {
      throw new Error("database down");
    }) as typeof q.get;
    console.error = () => {};
    g.forgetGateLock();
    assert.ok(await g.gateLock(), "still locked");
    assert.equal(await g.hasGatePass(good), false, "fail closed: even a good pass waits");
    assert.equal(await g.gatePass(), null, "and none is handed out");
  } finally {
    q.get = real;
    console.error = quiet;
    g.forgetGateLock();
  }
});

test("a slow read times out and keeps the site locked", async () => {
  const g = await gate();
  const { q } = await import("../src/lib/db");
  const real = q.get;
  const quiet = console.error;
  try {
    q.get = (() => new Promise(() => {})) as typeof q.get;
    console.error = () => {};
    g.forgetGateLock();
    const t = Date.now();
    assert.ok(await g.gateLock());
    assert.ok(Date.now() - t < g.LOCK_READ_TIMEOUT_MS + 1_000, "gives up after the timeout");
  } finally {
    q.get = real;
    console.error = quiet;
    g.forgetGateLock();
  }
});

test("the proxy reads the switch at most once per cache window", async () => {
  const g = await gate();
  const { q } = await import("../src/lib/db");
  const real = q.get;
  let reads = 0;
  try {
    q.get = ((...a: Parameters<typeof q.get>) => (reads++, real(...a))) as typeof q.get;
    for (let i = 0; i < 5; i++) await shownComingSoon();
    assert.equal(reads, 1);
  } finally {
    q.get = real;
    g.forgetGateLock();
  }
});

test("open paths never read the switch", async () => {
  const g = await gate();
  const { q } = await import("../src/lib/db");
  const { proxy } = await import("../src/proxy");
  const real = q.get;
  let reads = 0;
  try {
    q.get = ((...a: Parameters<typeof q.get>) => (reads++, real(...a))) as typeof q.get;
    await proxy(new NextRequest(`${SITE}/api/health`));
    await proxy(new NextRequest(`${SITE}/coming-soon`));
    assert.equal(reads, 0);
  } finally {
    q.get = real;
    g.forgetGateLock();
  }
});

const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []));

test("only the super admin with two-factor sign-in can flip it, and every flip is in the admin log", () => {
  const actions = fs.readFileSync(new URL("../src/app/admin/actions.ts", import.meta.url), "utf8");
  const flipSwitch = actions.slice(actions.indexOf("export async function flipSwitch(")).split("\nexport ")[0];
  assert.match(flipSwitch, /requireAdminAction\("super"\)/);
  assert.match(flipSwitch, /logAdmin\(/);
  const admin = fs.readFileSync(new URL("../src/lib/admin.ts", import.meta.url), "utf8");
  const requireAction = admin.slice(admin.indexOf("export async function requireAdminAction(")).split("\nexport ")[0];
  assert.match(requireAction, /adminReady\(u\)/, "admin actions need two-factor sign-in");
  const writers = sources("src").filter((f) => /setSwitch\(/.test(fs.readFileSync(f, "utf8")) && !f.endsWith("lib/switches.ts"));
  assert.deepEqual(writers, ["src/app/admin/actions.ts"], "no other code writes a switch");
});

test("every gate caller asks site-gate, and nothing reads SITE_PASSWORD on its own", () => {
  const readers = sources("src").filter((f) => /process\.env\.SITE_PASSWORD/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(readers, ["src/lib/site-gate.ts"]);
  const raw = sources("src").filter((f) => !f.endsWith("lib/site-gate.ts") && /gatePassword\(\)|gateToken\(/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(raw, [], "callers use gateLock / gatePass / passFor, which include the switch");
});
