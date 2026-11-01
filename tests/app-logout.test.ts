import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-app-logout-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("app sign-out ends the caller's own session and never another account's", async () => {
  const { q } = await import("../src/lib/db");
  const { issueAppSession, endAppSession, readAccessToken } = await import("../src/lib/app-auth");
  const t = Date.now();
  const user = async (h: string) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?) RETURNING id", `${h}@x.io`, h, h, t))!.id;
  const me = await user("me");
  const them = await user("them");
  const mine = await issueAppSession(me, "Phone");
  const theirs = await issueAppSession(them, "Phone");
  const live = async (id: number) => Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", id))!.n);

  // Someone else's refresh token sent with my access token: theirs stays, mine (the bearer's) ends.
  await endAppSession(theirs.refreshToken, me, readAccessToken(mine.accessToken)!.session);
  assert.equal(await live(them), 1, "another account's session is untouched");
  assert.equal(await live(me), 0, "the bearer's own session ends");

  // No refresh token in the body at all: the bearer's session still ends on the server.
  const again = await issueAppSession(me, "Phone");
  await endAppSession("", me, readAccessToken(again.accessToken)!.session);
  assert.equal(await live(me), 0);
});
