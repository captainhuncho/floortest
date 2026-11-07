import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load. The human check is off here, so
// the per-address stop is the hard one (EMAIL_HARD).
process.env.DATA_DIR = testDataDir("ft-signin-audit-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.DATABASE_URL;

const ACTIONS = fs.readFileSync("src/app/(auth)/actions.ts", "utf8");
const body = (name: string) => {
  const start = ACTIONS.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = ACTIONS.indexOf("\nexport ", start + 1);
  return ACTIONS.slice(start, next < 0 ? undefined : next);
};

test("M4: a stranger asking for codes with someone's email can't stop the owner asking from their own connection", async () => {
  const { emailRequestBlocked, EMAIL_HARD } = await import("../src/lib/email-request-limits");
  const form = new FormData();
  for (const kind of ["reset", "login_code"] as const) {
    const email = `owner-${kind}@audit.io`;
    // The stranger uses up their own connection's share for this address…
    let stranger = 0;
    while (!(await emailRequestBlocked(kind, email, "10.0.0.66", form)) && stranger < 20) stranger++;
    assert.ok(stranger <= 5, `${kind}: the stranger is stopped after a few (${stranger})`);
    assert.ok(await emailRequestBlocked(kind, email, "10.0.0.66", form), `${kind}: and stays stopped`);
    // …and the owner, on another connection, still gets through.
    assert.equal(await emailRequestBlocked(kind, email, "10.0.0.7", form), null, `${kind}: the owner still gets a ${kind === "reset" ? "link" : "code"}`);
  }
  // With the human check off, one address from everywhere still has a ceiling, so its inbox can't be flooded.
  const email = "flooded@audit.io";
  let sent = 0;
  for (let i = 0; i < EMAIL_HARD + 5; i++) if (!(await emailRequestBlocked("reset", email, `10.1.0.${i}`, form))) sent++;
  assert.equal(sent, EMAIL_HARD, "stops at the per-address ceiling");
});

test("M5: wrong two-step codes get growing holds per account, counted before the check, and right ones don't count", async () => {
  const { q } = await import("../src/lib/db");
  const { guardTwoStep } = await import("../src/lib/two-step-limits");
  const now = Date.now();
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES ('twostep@audit.io', 'h', 'Two Step', 'twostepaudit', 'free', 'UTC', ?, ?) RETURNING id",
    now, now,
  ))!.id;
  // Right answers hand their place back: many in a row never start a hold.
  for (let i = 0; i < 8; i++) assert.ok("result" in (await guardTwoStep(id, async () => true)), "a right code goes through");
  // A right answer clears the round from its millisecond on: step past it, as any real next try would.
  await new Promise((r) => setTimeout(r, 5));
  // Four wrong codes are just wrong; the fifth starts a 2-minute hold.
  for (let i = 0; i < 4; i++) assert.ok("wrong" in (await guardTwoStep(id, async () => false)), `wrong code ${i + 1}`);
  const fifth = await guardTwoStep(id, async () => false);
  assert.ok("held" in fifth && fifth.held.holdLeft > 0 && fifth.held.holdLeft <= 2 * 60_000, "the fifth starts a 2-minute hold");
  // While held, nothing is checked, a right code included.
  let ran = false;
  assert.ok("held" in (await guardTwoStep(id, async () => (ran = true))), "still held");
  assert.equal(ran, false, "nothing checked during the hold");
  // Wrong tries still show on Admin → Security.
  assert.equal(Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = 'twofa_fail' AND key = ?", `user:${id}`))!.n), 5);
  // The owner hears their password is known (sent after the answer, so wait for it).
  let mail: { subject: string } | undefined;
  for (let i = 0; i < 50 && !mail; i++) {
    await new Promise((r) => setTimeout(r, 50));
    mail = await q.get<{ subject: string }>("SELECT subject FROM outbox WHERE user_id = ? ORDER BY id DESC LIMIT 1", id);
  }
  assert.match(mail?.subject ?? "", /password was used, but the two-step code was wrong/);
});

test("M5: wrong two-step codes sent all at once never get more than a round's five checked", async () => {
  const { q } = await import("../src/lib/db");
  const { guardTwoStep } = await import("../src/lib/two-step-limits");
  const now = Date.now();
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES ('burst@audit.io', 'h', 'Burst', 'burstaudit', 'free', 'UTC', ?, ?) RETURNING id",
    now, now,
  ))!.id;
  let checked = 0;
  const all = await Promise.all(Array.from({ length: 20 }, () => guardTwoStep(id, async () => (checked++, false))));
  assert.ok(checked <= 5, `at most five checked (${checked})`);
  assert.ok(all.filter((r) => "held" in r).length >= 15, "the rest are held");
});

test("M5: the website, the app and ops all go through the same two-step holds", () => {
  for (const file of ["src/app/(auth)/actions.ts", "src/app/api/v1/auth/login/route.ts", "src/app/ops-login/actions.ts"]) {
    const src = fs.readFileSync(file, "utf8");
    assert.match(src, /guardTwoStep\(/, `${file} uses the holds`);
    assert.doesNotMatch(src, /recentCount\("twofa_fail"/, `${file} has no flat cap of its own`);
  }
});

test("M2 and M4: forgot password and sign-in codes look up and email the account after the answer, codes per browser", () => {
  for (const name of ["requestPasswordReset", "requestLoginCode"]) {
    const fn = body(name);
    assert.match(fn, /emailRequestBlocked\(/, `${name} uses the shared limits`);
    const lookup = fn.indexOf("FROM users WHERE email");
    assert.ok(lookup > fn.indexOf("afterResponse(async"), `${name} looks the address up only after the answer`);
    assert.match(fn, /suspended_at IS NULL/, `${name} sends nothing to a suspended account`);
  }
  assert.match(body("requestLoginCode"), /INSERT INTO sign_in_codes \(user_id, requester,/);
  assert.match(body("requestLoginCode"), /ON CONFLICT \(user_id, requester\)/, "a new code replaces only this browser's");
  assert.doesNotMatch(ACTIONS, /login_codes/, "the old one-per-account table isn't written");
  // Signing up with an email that has an account: the heads-up goes after the answer.
  assert.match(ACTIONS, /if \(owner\) \{\s*afterResponse\(/);
});

test("M3: a sign-in code gets one answer whether it's wrong, used up, expired or for no account", () => {
  const fn = body("verifyLoginCode");
  assert.doesNotMatch(fn, /has expired|Too many wrong codes|didn't work\. Check/, "no answer of its own for each case");
  assert.equal(fn.match(/error: CODE_FAILED/g)?.length, 2, "a wrong or missing code, and a code used at the same moment");
  assert.match(fn, /user\?\.id \?\? 0/, "the count runs for a missing account too, so timing doesn't tell");
  assert.match(fn, /AND requester = \?/, "only this browser's code");
});

test("two browsers can each hold a sign-in code for one account", async () => {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES ('codes@audit.io', 'h', 'Codes', 'codesaudit', 'free', 'UTC', ?, ?) RETURNING id",
    t, t,
  ))!.id;
  const put = (device: string, hash: string) =>
    q.run(
      `INSERT INTO sign_in_codes (user_id, requester, code_hash, attempts, expires_at, created_at) VALUES (?,?,?,0,?,?)
       ON CONFLICT (user_id, requester) DO UPDATE SET code_hash = excluded.code_hash`,
      id, device, hash, t + 600_000, t,
    );
  await put("owner-browser", "a");
  await put("stranger-browser", "b");
  await put("stranger-browser", "c");
  assert.deepEqual(await q.all("SELECT requester, code_hash FROM sign_in_codes WHERE user_id = ? ORDER BY requester", id), [
    { requester: "owner-browser", code_hash: "a" },
    { requester: "stranger-browser", code_hash: "c" },
  ]);
  const { revokeAllSessions } = await import("../src/lib/sessions");
  await revokeAllSessions(id);
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM sign_in_codes WHERE user_id = ?", id))!.n, 0, "signing out everywhere clears them");
});

test("the proxy skips only the real favicon and the upload route, and the static folders can't be link names", async () => {
  const { config } = await import("../src/proxy");
  const runsProxy = new RegExp(`^${config.matcher[0]}$`);
  for (const path of ["/faviconz", "/favicon-x", "/api/storage/uploadx", "/api/storage/upload.png"]) assert.ok(runsProxy.test(path), `${path} goes through the proxy`);
  for (const path of ["/favicon.ico", "/api/storage/upload", "/api/storage/upload/abc"]) assert.ok(!runsProxy.test(path), `${path} is still skipped`);
  const { RESERVED_HANDLES } = await import("../src/lib/plans");
  for (const h of ["auth", "brand", "icons", "motion", "tour", "fonts", "images"]) assert.ok(RESERVED_HANDLES.has(h), `${h} is reserved`);
});

test("error reports never carry the proxy's read mark", async () => {
  const { sentryOptions } = await import("../src/lib/sentry-options");
  const event = { request: { url: "https://floortest.app/dashboard", headers: { "X-Ft-Read": "mark", "user-agent": "x" } } };
  const out = (sentryOptions.beforeSend as (e: unknown) => { request: { headers: Record<string, string> } })(event);
  assert.deepEqual(out.request.headers, { "user-agent": "x" });
});
