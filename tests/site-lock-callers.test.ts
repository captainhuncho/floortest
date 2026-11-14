import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { testDataDir } from "./test-db";
import { form, inRequest, type Jar } from "./request-scope";

// The site lock, run for real (Safety's review of #532): every place that hands out a pass, with the lock off, the
// switch unreadable and the lock turned back on; who may flip it; and how reads are shared and failures remembered.
process.env.DATA_DIR = testDataDir("ft-site-lock-callers-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.SITE_PASSWORD = "lock-callers-only";
process.env.ADMIN_EMAILS = "lock-super@example.test";
delete process.env.VERCEL_ENV;
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const SITE = "https://floortest.app";
const PASSWORD = "lock-callers-only";
type State = "off" | "unreadable" | "relocked";

let n = 0;
async function user(email: string, extra: { verified?: boolean; totp?: boolean } = {}) {
  const { q, now } = await import("../src/lib/db");
  n++;
  return (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at, totp_enabled_at) VALUES (?, 'h', ?, ?, 'free', 'dj', 'UTC', ?, ?, ?) RETURNING id",
    email,
    `User ${n}`,
    `lockuser${n}`,
    now(),
    extra.verified === false ? null : now(),
    extra.totp ? now() : null,
  ))!.id;
}

let boss: number | undefined;
async function flip(on: boolean) {
  boss ??= await user("lock-super@example.test", { totp: true });
  const { setSwitch } = await import("../src/lib/switches");
  await setSwitch("site_lock", on, boss);
  // updated_at is the generation; two flips in one test must never share a millisecond.
  await new Promise((r) => setTimeout(r, 5));
}

/** Makes only the site_lock read fail (the rest of the database keeps working), until the returned undo runs. */
async function breakLockRead() {
  const { q } = await import("../src/lib/db");
  const real = q.get;
  const quiet = console.error;
  q.get = ((sql: string, ...a: unknown[]) => {
    if (/updated_at FROM switches/.test(sql)) return Promise.reject(new Error("database down"));
    return (real as (s: string, ...r: unknown[]) => Promise<unknown>)(sql, ...a);
  }) as typeof q.get;
  console.error = () => {};
  return () => {
    q.get = real;
    console.error = quiet;
  };
}

/**
 * Puts the lock in `state` and runs `check` with the pass a browser should get then (null: none). Each state starts
 * from a clean read.
 */
async function inState(state: State, check: (want: string | null) => Promise<void>) {
  const g = await import("../src/lib/site-gate");
  let undo = () => {};
  if (state === "off") await flip(false);
  if (state === "relocked") {
    await flip(false);
    await flip(true);
  }
  g.forgetGateLock();
  const want = state === "relocked" ? await g.gatePass() : null;
  if (state === "relocked") assert.ok(want, "a re-locked site hands out a pass");
  if (state === "unreadable") undo = await breakLockRead();
  try {
    g.forgetGateLock();
    await check(want);
  } finally {
    undo();
    g.forgetGateLock();
  }
}

const STATES: State[] = ["off", "unreadable", "relocked"];

test("the invite link: a pass only for the current lock, none while open or unreadable", async () => {
  const { q, now } = await import("../src/lib/db");
  const { GET } = await import("../src/app/invite/[code]/route");
  for (const state of STATES) {
    const code = `FLOOR-${state.toUpperCase().padEnd(10, "X")}`;
    await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES (?, 1, '', ?, ?)", code, `${state}@x.io`, now());
    await inState(state, async (want) => {
      const res = await GET(new Request(`${SITE}/invite/${code}`), { params: Promise.resolve({ code }) } as RouteContext<"/invite/[code]">);
      assert.equal(res.cookies.get("ft_gate")?.value ?? null, want, state);
    });
  }
});

test("the team invite's sign-up link: a pass only for the current lock", async () => {
  const { q, now } = await import("../src/lib/db");
  const { GET } = await import("../src/app/join/[token]/signup/route");
  // A desk owned by the super admin has teams on (teamsOn), so its invites are live.
  boss ??= await user("lock-super@example.test", { totp: true });
  for (const state of STATES) {
    const secret = `team-${state}-${crypto.randomBytes(8).toString("hex")}`;
    await q.run(
      "INSERT INTO account_invites (account_id, email, role, token_hash, created_at, expires_at) VALUES (?, ?, 'member', ?, ?, ?)",
      boss,
      `team-${state}@x.io`,
      crypto.createHash("sha256").update(secret, "utf8").digest("hex"),
      now(),
      now() + 86_400_000,
    );
    await inState(state, async (want) => {
      const res = await GET(new Request(`${SITE}/join/${secret}/signup`), { params: Promise.resolve({ token: secret }) } as RouteContext<"/join/[token]/signup">);
      assert.match(res.headers.get("location") ?? "", /\/signup\?team=/, `${state}: the invite is live`);
      assert.equal(res.cookies.get("ft_gate")?.value ?? null, want, state);
    });
  }
});

test("the coming-soon form: a pass only for the current lock; while unreadable it never says whether the password was right", async () => {
  const { unlockSite } = await import("../src/app/coming-soon/actions");
  let ip = 0;
  for (const state of STATES) {
    await inState(state, async (want) => {
      const jar: Jar = new Map();
      const out = await inRequest(jar, `203.0.113.${++ip}`, () => unlockSite(undefined, form({ password: PASSWORD, next: "/dashboard" })));
      assert.equal(jar.get("ft_gate") ?? null, want, state);
      if (state === "unreadable") {
        assert.deepEqual(out.answer, { error: "The site can't be unlocked right now. Try again in a minute." });
        const wrong = await inRequest(new Map(), `203.0.113.${++ip}`, () => unlockSite(undefined, form({ password: "not-it", next: "/" })));
        assert.deepEqual(wrong.answer, out.answer, "a wrong password gets the same answer during an outage");
      } else assert.equal(out.redirect, "/dashboard", state);
    });
  }
});

test("signing in: a pass only for the current lock", async () => {
  const { createSession } = await import("../src/lib/auth");
  const id = await user("signin-lock@example.test");
  for (const state of STATES) {
    await inState(state, async (want) => {
      const jar: Jar = new Map();
      await inRequest(jar, "198.51.100.1", () => createSession(id));
      assert.ok([...jar.keys()].some((k) => k.includes("session")), `${state}: signed in`);
      assert.equal(jar.get("ft_gate") ?? null, want, state);
    });
  }
});

test("the receipt shows the sign-up invite only while the site is open", async () => {
  const { gateLock } = await import("../src/lib/site-gate");
  const page = fs.readFileSync(new URL("../src/app/receipt/[token]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const invite = !\(await gateLock\(\)\) && /, "the receipt asks gateLock()");
  for (const state of STATES) await inState(state, async () => assert.equal((await gateLock()) === null, state === "off", state));
});

test("only the super admin can flip the lock, and a flip to the state it has writes nothing", async () => {
  const { q, now } = await import("../src/lib/db");
  const { createOpsSession } = await import("../src/lib/ops");
  const { flipSwitch } = await import("../src/app/admin/actions");
  await flip(true);
  const gen = async () => String((await q.get<{ updated_at: number }>("SELECT updated_at FROM switches WHERE key = 'site_lock'"))!.updated_at);
  const before = await gen();

  // An ops team member with the "switches" area, two-step on, but not the super admin.
  const dev = await user("lock-dev@example.test", { totp: true });
  await q.run("INSERT INTO ops_members (user_id, role, created_at) VALUES (?, 'developer', ?)", dev, now());
  const devJar: Jar = new Map();
  await inRequest(devJar, "192.0.2.1", () => createOpsSession(dev));
  const refused = await inRequest(devJar, "192.0.2.1", () => flipSwitch("site_lock", false));
  assert.equal(refused.redirect, "/admin/no-access");
  assert.equal(await gen(), before, "nothing written");
  assert.ok(await q.get("SELECT 1 FROM admin_log WHERE admin_id = ? AND action = 'denied'", dev), "the refusal is logged");

  const superJar: Jar = new Map();
  await inRequest(superJar, "192.0.2.2", () => createOpsSession(boss!));
  await inRequest(superJar, "192.0.2.2", () => flipSwitch("site_lock", true));
  assert.equal(await gen(), before, "already on: no new generation, so nobody is signed out of the gate");
  await inRequest(superJar, "192.0.2.2", () => flipSwitch("site_lock", false));
  assert.notEqual(await gen(), before, "a real flip writes");
  assert.ok(await q.get("SELECT 1 FROM admin_log WHERE admin_id = ? AND action = 'switched off'", boss), "and is logged");
});

test("requests arriving together share one read; a failed read is remembered briefly, then tried again", async () => {
  const g = await import("../src/lib/site-gate");
  await flip(true);
  g.forgetGateLock();
  let r0 = g.lockReads();
  const shared = await Promise.all(Array.from({ length: 10 }, () => g.gateLock()));
  assert.equal(g.lockReads() - r0, 1, "ten at once, one read");
  assert.ok(shared.every((l) => l && l.gen === shared[0]!.gen));

  const undo = await breakLockRead();
  try {
    g.forgetGateLock();
    r0 = g.lockReads();
    const failed = await Promise.all(Array.from({ length: 10 }, () => g.gateLock()));
    assert.equal(g.lockReads() - r0, 1, "a failing read is shared too");
    assert.ok(failed.every((l) => l && g.passFor(l) === null), "nobody gets a pass");
    await g.gateLock();
    assert.equal(g.lockReads() - r0, 1, "the failure is remembered: no new query right away");
    await new Promise((r) => setTimeout(r, g.LOCK_FAIL_CACHE_MS + 100));
    await g.gateLock();
    assert.equal(g.lockReads() - r0, 2, "and tried again after it runs out");
  } finally {
    undo();
    g.forgetGateLock();
  }
});

test("a failed read uses the last good one for up to 30 seconds, then locks", async (t) => {
  const g = await import("../src/lib/site-gate");
  await flip(true);
  g.forgetGateLock();
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const good = (await g.gatePass())!;
  const undo = await breakLockRead();
  try {
    t.mock.timers.tick(g.LOCK_CACHE_MS + 1);
    assert.equal(await g.hasGatePass(good), true, "a busy moment doesn't lock out a pass holder");
    t.mock.timers.tick(g.LOCK_LAST_GOOD_MS);
    assert.equal(await g.hasGatePass(good), false, "after 30 seconds without a good read: locked");
  } finally {
    undo();
    t.mock.timers.reset();
    g.forgetGateLock();
  }
});

test("a read that started before a flip never caches the old state", async () => {
  const g = await import("../src/lib/site-gate");
  const { q } = await import("../src/lib/db");
  await flip(true);
  g.forgetGateLock();
  const real = q.get;
  let release = () => {};
  q.get = ((sql: string, ...a: unknown[]) => {
    if (!/updated_at FROM switches/.test(sql)) return (real as (s: string, ...r: unknown[]) => Promise<unknown>)(sql, ...a);
    return new Promise<unknown>((resolve) => (release = () => resolve({ on: 1, updated_at: "stale" })));
  }) as typeof q.get;
  const early = g.gateLock();
  q.get = real;
  await flip(false); // setSwitch calls forgetGateLock()
  release();
  assert.equal((await early)?.gen, "stale", "the early caller gets what it asked for");
  assert.equal(await g.gateLock(), null, "but the next request reads the flip, not the stale answer");
  g.forgetGateLock();
});
