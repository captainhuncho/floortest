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

const verify = async (jar: Jar, code: string) => {
  const { verifyLoginCode } = await load();
  return (await inRequest(jar, "10.9.0.1", () => verifyLoginCode(undefined, form({ code })))).answer as { error?: string } | undefined;
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
  for (const email of ["guessed@audit.io", "ghost@audit.io"]) {
    if (email.startsWith("guessed")) await person(email);
    // Twenty wrong codes this hour from other browsers.
    for (let i = 0; i < 20; i++) await q.run("INSERT INTO rate_events (bucket, key, created_at) VALUES ('login_code_guess', ?, ?)", email, Date.now());
    const jar: Jar = new Map();
    await askForCode(jar, email, null, "10.9.1.1");
    assert.match((await verify(jar, "111111"))?.error ?? "", /Too many wrong codes for this email/, `${email}: paused`);
    assert.equal(Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = 'login_code_guess' AND key = ?", email))!.n), 20, "a refused try isn't counted");
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
  await Promise.all(jars.flatMap((jar) => Array.from({ length: 5 }, () => verify(jar, "999999"))));
  const counted = Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = 'login_code_guess' AND key = ?", "burst-codes@audit.io"))!.n);
  assert.ok(counted <= 20, `at most 20 compared (${counted})`);
});

test("an account has at most five live codes; a sixth browser gets none and the others keep theirs", async () => {
  const { q } = await load();
  const id = await person("many-browsers@audit.io");
  for (let i = 0; i < 6; i++) await askForCode(new Map(), "many-browsers@audit.io", null, `10.9.3.${i}`);
  assert.equal(Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM sign_in_codes WHERE user_id = ?", id))!.n), 5);
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
