import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { testDataDir } from "./test-db";
import { form, inRequest, type Jar } from "./request-scope";

// The real sign-in actions, run end to end inside a request scope the test controls (cookies, connection). A throwaway
// local database; the human check is off.
process.env.DATA_DIR = testDataDir("ft-signin-flows-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.DATABASE_URL;

const load = async () => ({
  ...(await import("../src/app/(auth)/actions")),
  ...(await import("../src/lib/db")),
  env: (await import("../src/lib/env")).env,
});

async function person(email: string, extra = "") {
  const { q } = await load();
  const t = Date.now();
  const handle = email.split("@")[0].replace(/[^a-z0-9]/g, "").slice(0, 20) + "x";
  return (await q.get<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at${extra ? ", suspended_at" : ""}) VALUES (?, 'h', 'Flow Test', ?, 'free', 'UTC', ?, ?${extra ? ", ?" : ""}) RETURNING id`,
    ...[email, handle, t, t, ...(extra ? [t] : [])],
  ))!.id;
}

/** Asks for a code in this browser, then sets the stored code to one the test knows (the emailed one is redacted). */
async function askForCode(jar: Jar, email: string, userId: number | null, ip = "10.9.0.1") {
  const { requestLoginCode, q, env } = await load();
  const out = await inRequest(jar, ip, () => requestLoginCode(undefined, form({ email })));
  assert.equal(out.redirect, "/login/code/enter", "always moves on to the code page");
  const code = "123456";
  // The code is stored after the answer has gone back: give that a moment.
  await new Promise((r) => setTimeout(r, 150));
  if (userId) {
    const requester = crypto.createHash("sha256").update(jar.get("floortest_code_device")!).digest("hex");
    const hash = crypto.createHmac("sha256", env.secret).update(`${userId}:${code}`).digest("hex");
    let set = 0;
    for (let i = 0; i < 50 && !set; i++) {
      set = (await q.run("UPDATE sign_in_codes SET code_hash = ? WHERE user_id = ? AND requester = ?", hash, userId, requester)).changes;
      if (!set) await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(set, "the code was stored");
  }
  return code;
}

const verify = async (jar: Jar, code: string, ip = "10.9.0.1") => {
  const { verifyLoginCode } = await load();
  return (await inRequest(jar, ip, () => verifyLoginCode(undefined, form({ code })))).answer as { error?: string } | undefined;
};

const rows = async (bucket: string, key?: string) => {
  const { q } = await load();
  return Number(
    (key === undefined
      ? await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ?", bucket)
      : await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND key = ?", bucket, key))!.n,
  );
};

const FAILED = /didn't work or has expired/;

test("M3: wrong, expired, used, other browser's and no-account codes all get the one answer", async () => {
  const { q } = await load();
  const id = await person("flow-owner@audit.io");

  // Wrong.
  const a: Jar = new Map();
  const code = await askForCode(a, "flow-owner@audit.io", id);
  assert.match((await verify(a, "000000"))?.error ?? "", FAILED, "wrong");

  // Another browser's code: this browser asked too, but the code is the first browser's.
  const b: Jar = new Map();
  await askForCode(b, "flow-owner@audit.io", null, "10.9.0.2");
  assert.match((await verify(b, code))?.error ?? "", FAILED, "another browser's code");

  // Right, then used.
  const used = new Map(a);
  assert.equal(await verify(a, code), undefined, "the right code signs in");
  assert.ok(a.size < used.size, "and clears the code cookies");
  assert.match((await verify(used, code))?.error ?? "", FAILED, "a used code");

  // Expired.
  const c: Jar = new Map();
  const late = await askForCode(c, "flow-owner@audit.io", id, "10.9.0.3");
  await q.run("UPDATE sign_in_codes SET expires_at = ? WHERE user_id = ?", Date.now() - 1, id);
  assert.match((await verify(c, late))?.error ?? "", FAILED, "an expired code");

  // No account behind the email.
  const d: Jar = new Map();
  await askForCode(d, "nobody-here@audit.io", null, "10.9.0.4");
  assert.match((await verify(d, "123456"))?.error ?? "", FAILED, "no account");
});

test("wrong codes from every browser together pause code sign-in for that email, account or not", async () => {
  const { q } = await load();
  const { EMAIL_CEILING } = await import("../src/lib/email-request-limits");
  const CAP = 5 * EMAIL_CEILING; // five tries for each of the most requests an address can get in an hour
  for (const email of ["guessed@audit.io", "ghost@audit.io"]) {
    if (email.startsWith("guessed")) await person(email);
    // A full hour's wrong codes from other browsers.
    for (let i = 0; i < CAP; i++) await q.run("INSERT INTO rate_events (bucket, key, created_at) VALUES ('login_code_guess', ?, ?)", email, Date.now());
    const jar: Jar = new Map();
    await askForCode(jar, email, null, "10.9.1.1");
    assert.match((await verify(jar, "111111"))?.error ?? "", /Too many wrong codes for this email/, `${email}: paused`);
    assert.equal(await rows("login_code_guess", email), CAP, "a refused try isn't counted");
  }
});

test("wrong codes sent all at once from many browsers never get more than the cap checked", async () => {
  const { q } = await load();
  const id = await person("burst-codes@audit.io");
  const jars: Jar[] = [];
  for (let i = 0; i < 5; i++) {
    const jar: Jar = new Map();
    await askForCode(jar, "burst-codes@audit.io", id, `10.9.2.${i}`);
    jars.push(jar);
  }
  // Five browsers, five tries each would be 25: all sent at once.
  await Promise.all(jars.flatMap((jar, i) => Array.from({ length: 5 }, () => verify(jar, "999999", `10.9.2.${i}`))));
  // Each browser's request allows five, however many are sent at once.
  const counted = Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = 'login_code_guess' AND key = ?", "burst-codes@audit.io"))!.n);
  assert.ok(counted <= 25, `at most 25 compared (${counted})`);
  assert.equal(Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM sign_in_codes WHERE user_id = ? AND attempts > 5", id))!.n), 0, "no code tried more than five times");
});

test("an account has at most five live codes, even when browsers ask at the same moment; a refusal shows on Admin Security", async () => {
  const { q } = await load();
  const id = await person("many-browsers@audit.io");
  await Promise.all(Array.from({ length: 8 }, (_, i) => askForCode(new Map(), "many-browsers@audit.io", null, `10.9.3.${i}`)));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM sign_in_codes WHERE user_id = ?", id))!.n), 5);
  assert.equal(await rows("login_code_full", String(id)), 3, "each refused request is recorded");
});

test("hand-set or forged code cookies count nothing, account or not", async () => {
  const before = (await rows("login_code_guess")) + (await rows("login_code_verify_ip")) + (await rows("login_code_guess_pass"));
  const device = "A".repeat(32);
  for (const jar of [
    new Map([["floortest_code_email", "victim@audit.io"], ["floortest_code_device", device]]),
    new Map([["floortest_code_email", "victim@audit.io"], ["floortest_code_device", device], ["floortest_code_pass", `${Date.now()}.forged`]]),
  ] as Jar[])
    assert.match((await verify(jar, "123456", "10.9.5.1"))?.error ?? "", /took too long/);
  // A real pass for one email doesn't work for another.
  const real: Jar = new Map();
  await askForCode(real, "mine@audit.io", null, "10.9.5.2");
  real.set("floortest_code_email", "victim@audit.io");
  assert.match((await verify(real, "123456", "10.9.5.2"))?.error ?? "", /took too long/);
  // A badly shaped or oversized email in the cookie writes nothing either.
  const huge = new Map([["floortest_code_email", "x".repeat(4000)], ["floortest_code_device", device]]) as Jar;
  assert.match((await verify(huge, "123456", "10.9.5.3"))?.error ?? "", /took too long/);
  const after = (await rows("login_code_guess")) + (await rows("login_code_verify_ip")) + (await rows("login_code_guess_pass"));
  assert.equal(after, before, "no row written");
});

test("a few code requests and wrong tries from one connection never pause the owner's real code", async () => {
  const id = await person("cheap-pause@audit.io");
  const ip = "10.9.6.1";
  // Four code requests, five wrong tries each (the attack Safety found in round 3).
  for (let n = 0; n < 4; n++) {
    const jar: Jar = new Map();
    await askForCode(jar, "cheap-pause@audit.io", null, ip);
    for (let i = 0; i < 5; i++) await verify(jar, "000000", ip);
  }
  // The owner, elsewhere, asks for a code and types it: signed in.
  const owner: Jar = new Map();
  const code = await askForCode(owner, "cheap-pause@audit.io", id, "10.9.6.2");
  assert.equal(await verify(owner, code, "10.9.6.2"), undefined, "the right code signs in, no pause");
});

test("one connection runs out of tries across all emails long before any address pauses", async () => {
  const ip = "10.9.8.1";
  for (const email of ["first-target@audit.io", "second-target@audit.io"])
    for (let n = 0; n < 5; n++) {
      const jar: Jar = new Map();
      await askForCode(jar, email, null, ip);
      for (let i = 0; i < 5; i++) await verify(jar, "000000", ip);
    }
  assert.equal((await rows("login_code_guess", "first-target@audit.io")) + (await rows("login_code_guess", "second-target@audit.io")), 30, "30 tries from the connection in all");
  const owner: Jar = new Map();
  await askForCode(owner, "second-target@audit.io", null, "10.9.8.2");
  assert.match((await verify(owner, "000000", "10.9.8.2"))?.error ?? "", FAILED, "an ordinary wrong-code answer, not a pause");
});

test("each code request gives five tries in that browser, account or not", async () => {
  const jar: Jar = new Map();
  await askForCode(jar, "five-tries@audit.io", null, "10.9.7.1");
  for (let i = 0; i < 8; i++) await verify(jar, "000000", "10.9.7.1");
  assert.equal(await rows("login_code_guess", "five-tries@audit.io"), 5, "only five counted against the email");
});

test("M2: forgot password answers the same for an account, no account and a suspended account; only the live account gets a link", async () => {
  const { requestPasswordReset, q } = await load();
  const live = await person("reset-live@audit.io");
  const gone = await person("reset-suspended@audit.io", "suspended");
  for (const email of ["reset-live@audit.io", "reset-nobody@audit.io", "reset-suspended@audit.io"]) {
    const out = await inRequest(new Map(), "10.9.4.1", () => requestPasswordReset(undefined, form({ email })));
    assert.deepEqual(out.answer, { ok: true }, `${email}: same answer`);
  }
  const links = async (id: number) => Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ?", id))!.n);
  for (let i = 0; i < 50 && !(await links(live)); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(await links(live), 1, "the live account gets a link");
  assert.equal(await links(gone), 0, "a suspended account gets none");
});
