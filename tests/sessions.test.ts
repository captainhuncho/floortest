import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-sessions-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const DAY = 86_400_000;

async function setup() {
  const { q } = await import("../src/lib/db");
  const { hashToken } = await import("../src/lib/token-hash");
  const t = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?, ?) RETURNING id", `${handle}@x.io`, handle, handle, t, t))!.id;
  const session = async (userId: number, token: string, o: { kind?: "web" | "app"; device?: string; label?: string; createdAgo?: number; seenAgo?: number | null }) => {
    const created = t - (o.createdAgo ?? 0);
    const seen = o.seenAgo === null ? null : t - (o.seenAgo ?? o.createdAgo ?? 0);
    await q.run(
      "INSERT INTO sessions (token_hash, user_id, expires_at, created_at, kind, label, device, last_seen_at) VALUES (?,?,?,?,?,?,?,?)",
      hashToken(token), userId, t + 30 * DAY, created, o.kind ?? "web", o.label ?? "", o.device ?? "", seen,
    );
    return hashToken(token);
  };
  return { q, hashToken, t, user, session };
}

test("the devices list shows live sessions, newest use first, and leaves out a browser idle for 14 days", async () => {
  const { user, session, t } = await setup();
  const { deviceId, listSessions, WEB_IDLE_MS } = await import("../src/lib/sessions");
  const me = await user("devices");
  const laptop = await session(me, "laptop", { device: "Chrome on macOS", createdAgo: 10 * DAY, seenAgo: 1 * DAY });
  const phoneApp = await session(me, "phone", { kind: "app", label: "Tess's iPhone", createdAgo: 2 * DAY, seenAgo: null });
  await session(me, "old-tablet", { device: "Safari on iOS", createdAgo: 25 * DAY, seenAgo: 20 * DAY }); // idle: out
  await session(me, "ancient", { device: "Firefox on Linux", createdAgo: WEB_IDLE_MS / DAY * DAY + DAY, seenAgo: null }); // never seen, created too long ago: out
  const list = await listSessions(me, laptop, t);
  assert.deepEqual(
    list.map((s) => [s.device, s.kind, s.current]),
    [
      ["Chrome on macOS", "web", true],
      ["Tess's iPhone", "app", false],
    ],
    "the idle browser and the forgotten one are gone; the app session stays (it refreshes itself)",
  );
  // The page gets an opaque id per device, never the session's lookup key (app access tokens carry that one).
  assert.equal(list[0].id, deviceId(laptop));
  assert.equal(list[1].id, deviceId(phoneApp));
  assert.ok(list.every((s) => !JSON.stringify(s).includes(laptop) && !JSON.stringify(s).includes(phoneApp)), "no token hash in the list");
});

test("a device can be signed out only by its own account", async () => {
  const { user, session } = await setup();
  const { deviceId, endSession, listSessions } = await import("../src/lib/sessions");
  const me = await user("owner1");
  const other = await user("other1");
  const h = deviceId(await session(me, "mine", { device: "Edge on Windows" }));
  assert.equal(await endSession(other, h), false, "someone else's account can't end it");
  assert.equal((await listSessions(me, null)).length, 1);
  assert.equal(await endSession(me, h), true);
  assert.equal((await listSessions(me, null)).length, 0);
  assert.equal(await endSession(me, h), false, "already gone");
});

test("last seen is written at most once an hour", async () => {
  const { q, user, session, t } = await setup();
  const { touchSession } = await import("../src/lib/sessions");
  const me = await user("touchy");
  const h = await session(me, "t1", { device: "Chrome on Android", createdAgo: 2 * DAY, seenAgo: 2 * DAY });
  assert.equal(await touchSession(h, t - 10 * 60_000, t), false, "seen ten minutes ago: nothing written");
  assert.equal(await touchSession(h, t - 2 * 3_600_000, t), true, "seen two hours ago: written");
  assert.equal(Number((await q.get<{ s: number }>("SELECT last_seen_at AS s FROM sessions WHERE token_hash = ?", h))!.s), t);
  assert.equal(await touchSession(h, null, t), true, "never seen: written");
});

test("the nightly clean-up removes idle browser sessions and keeps app sessions", async () => {
  const { q, user, session, t } = await setup();
  const { cleanupRecords } = await import("../src/lib/retention");
  const me = await user("cleaner");
  const keep = await session(me, "fresh", { device: "Chrome on macOS", createdAgo: 3 * DAY, seenAgo: 1 * DAY });
  const app = await session(me, "app", { kind: "app", label: "Phone", createdAgo: 40 * DAY, seenAgo: null });
  await q.run("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", t + 20 * DAY, app); // app refresh tokens live 60 days; still live
  const idle = await session(me, "idle", { device: "Safari on iOS", createdAgo: 30 * DAY, seenAgo: 15 * DAY });
  await cleanupRecords(t);
  const left = (await q.all<{ token_hash: string }>("SELECT token_hash FROM sessions WHERE user_id = ?", me)).map((r) => r.token_hash).sort();
  assert.deepEqual(left, [keep, app].sort(), "the idle browser is gone");
  assert.equal(left.includes(idle), false);
});
