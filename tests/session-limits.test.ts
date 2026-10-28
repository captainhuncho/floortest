import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-session-limits-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const DAY = 86_400_000;
const MIN = 60_000;

async function setup() {
  const { q } = await import("../src/lib/db");
  const { hashToken } = await import("../src/lib/token-hash");
  const t = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?, ?) RETURNING id", `${handle}@x.io`, handle, handle, t, t))!.id;
  const web = async (userId: number, token: string) => {
    await q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, kind, last_seen_at) VALUES (?,?,?,?,'web',?)", hashToken(token), userId, t + 30 * DAY, t, t);
    return hashToken(token);
  };
  const app = async (userId: number, token: string, createdAgo: number, expiresIn = 30 * DAY) => {
    await q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, kind, label) VALUES (?,?,?,?,'app','Phone')", hashToken(token), userId, t + expiresIn, t - createdAgo);
    return hashToken(token);
  };
  const ops = async (userId: number, token: string, seenAgo = 0) => {
    await q.run("INSERT INTO admin_sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)", hashToken(token), userId, t - seenAgo, t - seenAgo, t + 8 * 3_600_000);
    return hashToken(token);
  };
  const count = async (sql: string, ...args: unknown[]) => Number((await q.get<{ n: number }>(sql, ...args))!.n);
  return { q, hashToken, t, user, web, app, ops, count };
}

test("an app sign-in carries its first sign-in time through every refresh and stops after 90 days", async () => {
  const { q, user, count } = await setup();
  const { APP_SESSION_MAX_MS, issueAppSession, refreshAppSession } = await import("../src/lib/app-auth");
  assert.equal(APP_SESSION_MAX_MS, 90 * DAY);
  const me = await user("appcap");
  const first = await issueAppSession(me, "Phone");
  const row = async () => (await q.get<{ created_at: number; expires_at: number }>("SELECT created_at, expires_at FROM sessions WHERE user_id = ? AND kind = 'app'", me))!;
  const signedIn = Number((await row()).created_at);
  const second = await refreshAppSession(first.refreshToken);
  assert.ok(second, "a fresh sign-in refreshes");
  assert.equal(await refreshAppSession(first.refreshToken), null, "the old refresh token stops working");
  assert.equal(Number((await row()).created_at), signedIn, "the first sign-in time is carried, not reset");
  // 85 days in: still refreshes, but the new token can't outlive day 90.
  await q.run("UPDATE sessions SET created_at = ? WHERE user_id = ? AND kind = 'app'", Date.now() - 85 * DAY, me);
  const third = await refreshAppSession(second!.refreshToken);
  assert.ok(third, "inside 90 days it refreshes");
  const r = await row();
  assert.ok(Number(r.expires_at) <= Number(r.created_at) + 90 * DAY, "the refreshed token ends at the 90-day mark, not 60 days on");
  // Past 90 days: refused, and the row is gone.
  await q.run("UPDATE sessions SET created_at = ?, expires_at = ? WHERE user_id = ? AND kind = 'app'", Date.now() - 91 * DAY, Date.now() + 30 * DAY, me);
  assert.equal(await refreshAppSession(third!.refreshToken), null, "refused past 90 days, even with time left on the token");
  assert.equal(await count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", me), 0);
});

test("app tokens issued before the cap count their 90 days from their latest refresh", async () => {
  const { user, app } = await setup();
  const { refreshAppSession } = await import("../src/lib/app-auth");
  const me = await user("legacyapp");
  await app(me, "legacy-recent", 10 * DAY); // refreshed 10 days ago: row looks like any old one
  assert.ok(await refreshAppSession("legacy-recent"), "an existing phone keeps working");
  await app(me, "legacy-stale", 95 * DAY, 1 * DAY);
  assert.equal(await refreshAppSession("legacy-stale"), null);
});

test("a password reset ends every session, the ops area included, and every other reset link", async () => {
  const { q, user, web, app, ops, count } = await setup();
  const { consumePasswordReset, createPasswordReset, findPasswordReset } = await import("../src/lib/password-reset");
  const me = await user("resetme");
  const other = await user("bystander");
  await web(me, "laptop");
  await app(me, "phone", DAY);
  await ops(me, "ops-desk");
  await web(other, "theirs");
  const link = await createPasswordReset(me);
  const spare = await createPasswordReset(me);
  assert.ok(await findPasswordReset(spare));
  assert.equal(await consumePasswordReset(link, "a brand new long password"), me);
  assert.equal(await count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", me), 0, "browsers and the app are signed out");
  assert.equal(await count("SELECT COUNT(*) AS n FROM admin_sessions WHERE user_id = ?", me), 0, "the ops area is signed out");
  assert.equal(await findPasswordReset(spare), undefined, "an older emailed link no longer works");
  assert.equal(await consumePasswordReset(spare, "someone elses password 123"), null);
  assert.equal(await count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", other), 1, "another account is untouched");
  assert.notEqual((await q.get<{ h: string }>("SELECT password_hash AS h FROM users WHERE id = ?", me))!.h, "h");
});

test("a password change keeps this browser and ends every other session, ops and reset links", async () => {
  const { user, web, app, ops, count, q } = await setup();
  const { changePasswordTo, createPasswordReset, findPasswordReset } = await import("../src/lib/password-reset");
  const me = await user("changeme");
  const here = await web(me, "this-browser");
  await web(me, "old-laptop");
  await app(me, "old-phone", DAY);
  await ops(me, "ops-desk");
  const link = await createPasswordReset(me);
  assert.equal(await changePasswordTo(me, "another brand new password", here), 3, "two sessions and one ops session ended");
  const left = await q.all<{ token_hash: string }>("SELECT token_hash FROM sessions WHERE user_id = ?", me);
  assert.deepEqual(left.map((r) => r.token_hash), [here], "only the browser that changed it stays signed in");
  assert.equal(await count("SELECT COUNT(*) AS n FROM admin_sessions WHERE user_id = ?", me), 0);
  assert.equal(await findPasswordReset(link), undefined, "a reset link asked for earlier stops working");
});

test("revokeAllSessions only touches the account it's given", async () => {
  const { user, web, ops, count } = await setup();
  const { revokeAllSessions } = await import("../src/lib/sessions");
  const a = await user("revokea");
  const b = await user("revokeb");
  await web(a, "a1");
  await ops(a, "a-ops");
  await web(b, "b1");
  await ops(b, "b-ops");
  assert.equal(await revokeAllSessions(a), 2);
  assert.equal(await count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", b), 1);
  assert.equal(await count("SELECT COUNT(*) AS n FROM admin_sessions WHERE user_id = ?", b), 1);
});

test("an ops session ends after 30 minutes without use", async () => {
  const { user, ops } = await setup();
  const { OPS_IDLE_MS, opsSessionLive } = await import("../src/lib/ops");
  assert.equal(OPS_IDLE_MS, 30 * MIN);
  const me = await user("opsidle");
  const fresh = await ops(me, "ops-fresh", 29 * MIN);
  const idle = await ops(me, "ops-idle", 31 * MIN);
  assert.equal(await opsSessionLive(fresh, me), true, "used 29 minutes ago: live");
  assert.equal(await opsSessionLive(idle, me), false, "used 31 minutes ago: over");
});

test("the old session cookie name is read only until the cut-off, and only on the live site", async () => {
  const { OLD_COOKIE_UNTIL, readSessionToken } = await import("../src/lib/sessions");
  const jar = (c: Record<string, string>) => ({ get: (n: string) => (n in c ? { value: c[n] } : undefined) });
  const before = OLD_COOKIE_UNTIL - 1;
  const after = OLD_COOKIE_UNTIL;
  assert.equal(readSessionToken(jar({ "__Host-floortest_session": "new" }), true, after), "new", "the current name always works");
  assert.equal(readSessionToken(jar({ floortest_session: "old" }), true, before), "old", "before the cut-off a live session under the old name still works");
  assert.equal(readSessionToken(jar({ floortest_session: "old" }), true, after), undefined, "after it, the old name is no longer accepted");
  assert.equal(readSessionToken(jar({ floortest_session: "old", "__Host-floortest_session": "new" }), true, before), "new", "the new name wins");
  assert.equal(readSessionToken(jar({ floortest_session: "local" }), false, after), "local", "locally that is the current name");
});
