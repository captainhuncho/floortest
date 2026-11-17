import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
// Gives server code the server build of next/navigation, as Next's bundler does.
import { inRequest, type Jar } from "./request-scope";
import { agreeTerms } from "./agree-terms";
import crypto from "node:crypto";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = testDataDir("ft-sign-out-everywhere-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
process.env.ADMIN_EMAILS = "soe-ops@x.io";

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

/** A browser signed in as this person (a real session row and cookie). */
async function signedIn(id: number): Promise<Jar> {
  const { createSession } = await import("../src/lib/auth");
  const jar: Jar = new Map();
  await inRequest(jar, "203.0.113.47", () => createSession(id));
  return jar;
}

test("the action: a Member on a team desk and an admin's View as are refused; the owner ends on /signed-out", async () => {
  const { q, now } = await import("../src/lib/db");
  const { DESK_COOKIE, signViewAs, VIEW_AS_COOKIE } = await import("../src/lib/auth");
  const { signOutAllMyDevices } = await import("../src/app/dashboard/actions/security");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now());
  const owner = await person("soe-owner@x.io", "soeowner");
  const member = await person("soe-member@x.io", "soemember");
  for (const p of [owner, member]) await agreeTerms(p.id);
  await q.run("UPDATE users SET plan = 'team' WHERE id = ?", owner.id);
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", owner.id, member.id, now());

  // A Member working the owner's desk: refused before the password is even looked at, and nobody is signed out.
  const asMember = await signedIn(member.id);
  asMember.set(DESK_COOKIE, String(owner.id));
  const refused = await inRequest(asMember, "203.0.113.47", () => signOutAllMyDevices(PASSWORD, ""), { dropAfter: true });
  assert.match(String(refused.redirect), /^\/dashboard\/settings\/team\?denied=1/, "sent to the Team page with its note");
  assert.deepEqual(await owner.left(), { sessions: 3, ops: 1 }, "the owner's sessions are untouched");
  assert.equal((await member.left()).sessions, 4, "and so are the Member's own");

  // An ops admin viewing the owner's desk reads only: the action changes nothing, even with the right password.
  const admin = await person("soe-ops@x.io", "soeops");
  const token = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await q.run("UPDATE users SET totp_enabled_at = ? WHERE id = ?", now(), admin.id);
  await q.run("INSERT INTO admin_sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)", hash, admin.id, now(), now(), now() + 3_600_000);
  const viewing: Jar = new Map([[VIEW_AS_COOKIE, signViewAs(admin.id, owner.id, hash, process.env.APP_SECRET!)]]);
  const looked = await inRequest(viewing, "203.0.113.47", () => signOutAllMyDevices(PASSWORD, ""), { dropAfter: true });
  assert.equal(looked.redirect, "/dashboard/floor?readonly=1", "View as reads only: sent back to the desk");
  assert.deepEqual(await owner.left(), { sessions: 3, ops: 1 }, "nothing ended in View as");

  // The owner, on their own desk, with the right password: every session gone, this browser's too, then /signed-out.
  const asOwner = await signedIn(owner.id);
  assert.equal((await owner.left()).sessions, 4);
  const wrong = await inRequest(asOwner, "203.0.113.47", () => signOutAllMyDevices("not-the-password", ""), { dropAfter: true });
  assert.deepEqual(wrong.answer, { error: "That password isn't right." });
  assert.equal((await owner.left()).sessions, 4, "a wrong password ends nothing");
  const done = await inRequest(asOwner, "203.0.113.47", () => signOutAllMyDevices(PASSWORD, ""), { dropAfter: true });
  assert.equal(done.redirect, "/signed-out");
  assert.deepEqual(await owner.left(), { sessions: 0, ops: 0 });
});
