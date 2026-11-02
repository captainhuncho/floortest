import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-login-lockout-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.TURNSTILE_SITE_KEY = "site";
process.env.TURNSTILE_SECRET_KEY = "secret";
delete process.env.DATABASE_URL;

const MIN = 60_000;

/** One wrong password the way sign-in counts it: the try's place first (claimTry), then the failure. */
async function wrongTry(email: string, ip: string) {
  const { claimTry, recordLoginFailure } = await import("../src/lib/login-limits");
  const attempt = await claimTry("login", email, ip);
  return attempt.hold ?? recordLoginFailure(email, ip);
}

test("a stranger's wrong passwords don't lock the owner out: the guessing connection is held, the owner elsewhere isn't", async () => {
  const { q } = await import("../src/lib/db");
  const { loginLocked, passwordHold } = await import("../src/lib/login-limits");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('bot_check', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", Date.now());
  for (let i = 0; i < 12; i++) await wrongTry("owner@x.io", "6.6.6.6");
  assert.ok(await passwordHold("login", "owner@x.io", "6.6.6.6"), "the guessing connection is on hold");
  assert.equal(await passwordHold("login", "owner@x.io", "1.2.3.4"), null, "the owner, elsewhere, isn't held");
  assert.equal(await loginLocked("owner@x.io", "1.2.3.4"), null, "and isn't stopped (the human check still applies)");
  for (let i = 0; i < 20; i++) await wrongTry(`other${i}@x.io`, "7.7.7.7");
  assert.equal(await loginLocked("new@x.io", "7.7.7.7"), "connection", "one connection trying many emails is stopped");
});

test("with the human check off there is nothing to ask for, so the per-email stop stays", async () => {
  const { q } = await import("../src/lib/db");
  const { loginLocked } = await import("../src/lib/login-limits");
  await q.run("UPDATE switches SET on_ = 0 WHERE key = 'bot_check'");
  for (let i = 0; i < 10; i++) await wrongTry("plain@x.io", `9.9.9.${i}`);
  assert.equal(await loginLocked("plain@x.io", "1.2.3.4"), "email");
  await q.run("UPDATE switches SET on_ = 1 WHERE key = 'bot_check'");
});

// Owner, 2 Nov: a password one letter off is wrong; the right password is never taken for a wrong one.
test("only the exact password is right: one letter, a case change or a space is wrong", async () => {
  const { hashPassword, verifyPassword } = await import("../src/lib/password-hash");
  const stored = await hashPassword("Correct-Horse-9");
  assert.equal(await verifyPassword("Correct-Horse-9", stored), true, "the exact password");
  for (const near of ["Correct-Horse-8", "correct-Horse-9", "Correct-Horse-9 ", " Correct-Horse-9", "Correct-Hors-9", "Correct-Horse-99", ""])
    assert.equal(await verifyPassword(near, stored), false, JSON.stringify(near));
});

test("holds grow on one email from one connection: 5 wrong → 2 min, then 5 min, 15 min, 1 h, 24 h with Report", async () => {
  const { q } = await import("../src/lib/db");
  const { HOLD_AFTER, HOLD_STEPS, afterWrongPassword, passwordHold } = await import("../src/lib/login-limits");
  const email = "ladder@x.io";
  const ip = "5.5.5.5";
  // Ends the hold in force by moving this connection's history back past it.
  const age = (ms: number) => q.run("UPDATE rate_events SET created_at = created_at - ? WHERE key = ?", ms, `${ip}|${email}`);
  for (const [step, length] of HOLD_STEPS.entries()) {
    for (let i = 1; i < HOLD_AFTER; i++) assert.equal(await afterWrongPassword("login", email, ip), null, `step ${step + 1}: wrong try ${i} starts nothing`);
    const hold = await afterWrongPassword("login", email, ip);
    assert.ok(hold, `step ${step + 1}: the fifth wrong try starts a hold`);
    assert.ok(Math.abs(hold.until - Date.now() - length) < 2_000, `step ${step + 1}: lasts ${length / MIN} min`);
    assert.equal(hold.final, step === HOLD_STEPS.length - 1, "only the last step offers Report");
    assert.ok(await passwordHold("login", email, ip), "it holds");
    await age(length + 1_000);
    assert.equal(await passwordHold("login", email, ip), null, "and ends on time, never permanent");
  }
  // Past the top it stays at 24 h rather than growing further.
  for (let i = 0; i < HOLD_AFTER; i++) await afterWrongPassword("login", email, ip);
  const top = await passwordHold("login", email, ip);
  assert.ok(top?.final && Math.abs(top.until - Date.now() - HOLD_STEPS.at(-1)!) < 2_000);
});

test("a hold keeps the length it started with, wrong tries at the same moment never jump a step, and a quiet day starts over", async () => {
  const { q } = await import("../src/lib/db");
  const { HOLD_AFTER, HOLD_STEPS, afterWrongPassword, passwordHold } = await import("../src/lib/login-limits");
  const email = "burst@x.io";
  const ip = "8.8.8.8";
  const age = (ms: number) => q.run("UPDATE rate_events SET created_at = created_at - ? WHERE key = ?", ms, `${ip}|${email}`);
  // Ten wrong tries at once (a double-submit, many tabs or a script): one first-step hold, not the top.
  await Promise.all(Array.from({ length: HOLD_AFTER * 2 }, () => afterWrongPassword("login", email, ip)));
  const first = await passwordHold("login", email, ip);
  assert.ok(first && !first.final && Math.abs(first.until - Date.now() - HOLD_STEPS[0]) < 2_000, "the first step, 2 minutes");
  // Climb to the 24-hour step, then let older holds pass the two-day mark: the 24 hours still stand.
  for (let step = 1; step < HOLD_STEPS.length; step++) {
    await age(HOLD_STEPS[step - 1] + 1_000);
    for (let i = 0; i < HOLD_AFTER; i++) await afterWrongPassword("login", email, ip);
  }
  const top = await passwordHold("login", email, ip);
  assert.ok(top?.final, "at the top");
  await q.run("DELETE FROM rate_events WHERE key = ? AND bucket <> 'login_hold_4'", `${ip}|${email}`);
  const still = await passwordHold("login", email, ip);
  assert.ok(still?.final && Math.abs(still.until - top.until) < 1_000, "earlier holds gone, the 24 hours unchanged");
  // A day after it ends with no more wrong tries, the steps start over at 2 minutes.
  await age(HOLD_STEPS.at(-1)! + 24 * 3_600_000 + 1_000);
  let next = null;
  for (let i = 0; i < HOLD_AFTER; i++) next = await afterWrongPassword("login", email, ip);
  assert.ok(next && !next.final && Math.abs(next.until - Date.now() - HOLD_STEPS[0]) < 2_000, "back to 2 minutes");
});

test("the right password is never counted as wrong, and it clears the wrong tries and the steps before it", async () => {
  const { HOLD_AFTER, afterRightPassword, afterWrongPassword, passwordHold } = await import("../src/lib/login-limits");
  const email = "typo@x.io";
  const ip = "4.4.4.4";
  // Four typos, then the right password: the next typos start nothing.
  for (let i = 1; i < HOLD_AFTER; i++) await afterWrongPassword("login", email, ip);
  await afterRightPassword("login", email, ip);
  for (let i = 1; i < HOLD_AFTER; i++) assert.equal(await afterWrongPassword("login", email, ip), null, `typo ${i} after a right password`);
  assert.equal(await passwordHold("login", email, ip), null, "four typos after a right password: no hold");
  // Right passwords alone never start a hold, however many.
  for (let i = 0; i < 20; i++) await afterRightPassword("login", "fine@x.io", ip);
  assert.equal(await passwordHold("login", "fine@x.io", ip), null);
});

test("a hold looks the same whether or not the email has an account, and app and ops count on their own", async () => {
  const { q } = await import("../src/lib/db");
  const { HOLD_AFTER, afterWrongPassword, holdAnswer, passwordHold } = await import("../src/lib/login-limits");
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('real@x.io', 'h', 'Real', 'realone', 'free', 'UTC', ?)", Date.now());
  const answers = [];
  for (const email of ["real@x.io", "nobody@x.io"]) {
    let hold = null;
    for (let i = 0; i < HOLD_AFTER; i++) hold = await afterWrongPassword("login", email, "3.3.3.3");
    assert.ok(hold, email);
    const a = holdAnswer(hold);
    answers.push({ error: a.error, final: a.holdFinal, left: Math.round(a.holdLeft / 10_000) });
  }
  assert.deepEqual(answers[0], answers[1], "same words, same step, same time left");
  assert.equal(await passwordHold("ops", "real@x.io", "3.3.3.3"), null, "an app hold doesn't hold ops, and the other way round");
});

test("tries sent at the same moment are counted first: a burst gets at most 5 checked, and a right one gives its place back", async () => {
  const { q } = await import("../src/lib/db");
  const { HOLD_AFTER, afterRightPassword, claimTry } = await import("../src/lib/login-limits");
  const ip = "9.8.7.6";
  // Twelve at once from one device for one email: every try past the fifth is answered with the hold, unchecked.
  const claims = await Promise.all(Array.from({ length: 12 }, () => claimTry("login", "burst2@x.io", ip)));
  assert.ok(claims.filter((c) => !c.hold).length <= HOLD_AFTER, "at most five go on to the password check");
  // A right password hands its place back: the connection and email counters don't grow.
  const before = Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = 'login_fail_ip' AND key = ?", "9.8.7.5"))?.n ?? 0);
  const right = await claimTry("login", "fine2@x.io", "9.8.7.5");
  await afterRightPassword("login", "fine2@x.io", "9.8.7.5", right);
  const after = Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = 'login_fail_ip' AND key = ?", "9.8.7.5"))?.n ?? 0);
  assert.equal(after, before, "a right password leaves no wrong-try record behind");
});

// Owner, 2 Nov: ops sign-in gets the same device-only holds instead of its old stop on the whole account.
test("ops holds: on the device only, never naming the wrong part, and no Report link (not on the ops host)", async () => {
  const { HOLD_AFTER, HOLD_STEPS, afterWrongPassword, holdAnswer, passwordHold } = await import("../src/lib/login-limits");
  let hold = null;
  for (let i = 0; i < HOLD_AFTER; i++) hold = await afterWrongPassword("ops", "staff@x.io", "2.2.2.2");
  assert.ok(hold && Math.abs(hold.until - Date.now() - HOLD_STEPS[0]) < 2_000, "the same first step");
  assert.ok(await passwordHold("ops", "staff@x.io", "2.2.2.2"), "the guessing device is held");
  assert.equal(await passwordHold("ops", "staff@x.io", "1.1.1.1"), null, "the staff member, elsewhere, isn't");
  const a = holdAnswer(hold, "ops");
  assert.doesNotMatch(a.error, /password/i, "never says the password was the wrong part");
  assert.equal(holdAnswer({ until: Date.now() + 1_000, final: true }, "ops").holdFinal, false, "no Report this on ops");
});
