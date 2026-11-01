import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-refresh-reuse-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("an app refresh token used twice ends that sign-in and is logged; other sign-ins stay", async () => {
  const { q } = await import("../src/lib/db");
  const { issueAppSession, refreshAppSession } = await import("../src/lib/app-auth");
  const t = Date.now();
  const me = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('me@x.io', 'h', 'Me', 'me', 'pro', 'UTC', ?) RETURNING id", t))!.id;
  const tablet = await issueAppSession(me, "Tablet", t - 60_000);
  const first = await issueAppSession(me, "Phone");
  const second = await refreshAppSession(first.refreshToken);
  assert.ok(second, "a normal refresh works");
  // The old token comes back: someone copied it. The thief's or the owner's copy, we can't tell, so the sign-in ends.
  assert.equal(await refreshAppSession(first.refreshToken), null);
  assert.equal(await refreshAppSession(second!.refreshToken), null, "the token issued after it stops working too");
  const left = await q.all<{ label: string }>("SELECT label FROM sessions WHERE user_id = ?", me);
  assert.deepEqual(left.map((r) => r.label), ["Tablet"], "a separate sign-in on another device stays");
  assert.ok(await q.get("SELECT 1 FROM account_log WHERE user_id = ? AND action = 'app_token_reused'", me), "logged on the account");
  assert.ok(await refreshAppSession(tablet.refreshToken), "the other sign-in still refreshes");
  assert.equal(await refreshAppSession("never-issued"), null, "an unknown token is simply refused");
});
