import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
// Gives server code the server build of next/navigation, as Next's bundler does.
import "./request-scope";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = testDataDir("ft-sign-out-everywhere-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const PASSWORD = "Correct-Horse-Battery-77";

/** A person with three ways in (this browser, another browser, the phone app) and an ops session. */
async function person(email: string, handle: string) {
  const { q } = await import("../src/lib/db");
  const { hashPassword } = await import("../src/lib/password-hash");
  const { hashToken } = await import("../src/lib/token-hash");
  const t = Date.now();
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, ?, 'Me', ?, 'pro', 'UTC', ?, ?) RETURNING id",
    email, await hashPassword(PASSWORD), handle, t, t,
  ))!.id;
  for (const [tok, kind] of [["this-browser", "web"], ["other-browser", "web"], ["phone-app", "app"]] as const)
    await q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, kind) VALUES (?,?,?,?,?)", hashToken(`${handle}-${tok}`), id, t + 86_400_000, t, kind);
  await q.run("INSERT INTO admin_sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)", hashToken(`${handle}-ops`), id, t, t, t + 3_600_000);
  const left = async () => ({
    sessions: Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", id))!.n),
    ops: Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM admin_sessions WHERE user_id = ?", id))!.n),
  });
  return { id, left, t };
}

test("a wrong password leaves every session in place; the right one ends them all, this one too", async () => {
  const { endEverySession } = await import("../src/lib/step-up");
  const me = await person("soe@x.io", "soe");
  const other = await person("soe-other@x.io", "soeother");

  assert.equal(await endEverySession(me.id, "not-the-password", ""), "That password isn't right.");
  assert.deepEqual(await me.left(), { sessions: 3, ops: 1 }, "nothing ended");

  assert.equal(await endEverySession(me.id, PASSWORD, ""), null);
  assert.deepEqual(await me.left(), { sessions: 0, ops: 0 }, "every browser, the app and the ops area, the current session included");
  assert.deepEqual(await other.left(), { sessions: 3, ops: 1 }, "someone else's sessions are untouched");
});

test("with two-step on, the password alone is not enough: the code is needed too", async () => {
  const { q } = await import("../src/lib/db");
  const { env } = await import("../src/lib/env");
  const { newTotpSecret, sealSecret, totpCode } = await import("../src/lib/totp");
  const { endEverySession } = await import("../src/lib/step-up");
  const me = await person("soe2@x.io", "soetwo");
  const secret = newTotpSecret();
  await q.run("UPDATE users SET totp_secret = ?, totp_enabled_at = ? WHERE id = ?", sealSecret(secret, env.secret), me.t, me.id);

  assert.equal(await endEverySession(me.id, PASSWORD, ""), "That two-step code didn't work.");
  assert.equal(await endEverySession(me.id, PASSWORD, "000000"), "That two-step code didn't work.");
  assert.deepEqual(await me.left(), { sessions: 3, ops: 1 }, "nothing ended without the code");

  assert.equal(await endEverySession(me.id, PASSWORD, totpCode(secret, Math.floor(Date.now() / 30_000))), null);
  assert.deepEqual(await me.left(), { sessions: 0, ops: 0 });
});
