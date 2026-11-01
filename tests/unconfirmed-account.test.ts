import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = testDataDir("ft-unconfirmed-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

// Someone can create an account with another person's email. Until that email is confirmed, the creator must not be
// able to lock the real owner out (two-factor) or move the account to an email they control.
async function setup() {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const make = async (handle: string, verified: boolean) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?, ?) RETURNING id", `${handle}@x.io`, handle, handle, t, verified ? t : null))!.id;
  return { q, make };
}

async function totpReady(userId: number) {
  const { q } = await import("../src/lib/db");
  const { env } = await import("../src/lib/env");
  const { newTotpSecret, sealSecret, totpCode } = await import("../src/lib/totp");
  const secret = newTotpSecret();
  await q.run("UPDATE users SET totp_secret = ? WHERE id = ?", sealSecret(secret, env.secret), userId);
  return totpCode(secret, Math.floor(Date.now() / 30_000));
}

test("an unconfirmed account can't turn on two-factor; a confirmed one can", async () => {
  const { q, make } = await setup();
  const { turnOnTwoFactor } = await import("../src/lib/two-factor");
  const squatter = await make("tfsquat", false);
  const r = await turnOnTwoFactor(squatter, await totpReady(squatter));
  assert.ok("error" in r, "refused until the email is confirmed");
  assert.equal((await q.get<{ on: number | null }>("SELECT totp_enabled_at AS on FROM users WHERE id = ?", squatter))!.on, null);
  const owner = await make("tfowner", true);
  const ok = await turnOnTwoFactor(owner, await totpReady(owner));
  assert.ok("codes" in ok && ok.codes.length > 0, "a confirmed account gets its recovery codes");
  assert.ok((await q.get<{ on: number | null }>("SELECT totp_enabled_at AS on FROM users WHERE id = ?", owner))!.on);
});

test("an unconfirmed account can't start an email change; a confirmed one can, and Ops still can", async () => {
  const { q, make } = await setup();
  const { requestEmailChange } = await import("../src/lib/accounts");
  const squatter = await make("emsquat", false);
  assert.ok(await requestEmailChange(squatter, "mine@evil.io", "user"), "refused until the current email is confirmed");
  assert.equal((await q.get<{ p: string | null }>("SELECT pending_email AS p FROM users WHERE id = ?", squatter))!.p, null);
  const owner = await make("emowner", true);
  assert.equal(await requestEmailChange(owner, "new-owner@x.io", "user"), null);
  assert.equal(await requestEmailChange(squatter, "support-fix@x.io", "admin"), null, "Ops checks the person another way");
});

test("a reset link on an unconfirmed account confirms the email and clears what the creator set up", async () => {
  const { q, make } = await setup();
  const { consumePasswordReset, createPasswordReset } = await import("../src/lib/password-reset");
  const id = await make("rssquat", false);
  const t = Date.now();
  await q.run("UPDATE users SET totp_secret = 'sealed', totp_enabled_at = ?, totp_last_step = 1, recovery_codes = '[\"x\"]' WHERE id = ?", t, id);
  await q.run(
    "INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, device_type, backed_up, name, created_at) VALUES (?, 'cred-rssquat', 'pk', 0, '[]', 'singleDevice', false, 'Theirs', ?)",
    id,
    t,
  );
  const link = await createPasswordReset(id);
  assert.equal(await consumePasswordReset(link, "the real owner's new password"), id);
  const u = (await q.get<{ v: number | null; secret: string | null; on: number | null; codes: string }>(
    "SELECT email_verified_at AS v, totp_secret AS secret, totp_enabled_at AS on, recovery_codes AS codes FROM users WHERE id = ?",
    id,
  ))!;
  assert.ok(u.v, "the link reached the inbox, so the email is confirmed");
  assert.deepEqual([u.secret, u.on, u.codes], [null, null, "[]"], "the creator's two-factor is gone");
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?", id))!.n, 0, "and their passkeys");

  const owner = await make("rsowner", true);
  await q.run("UPDATE users SET totp_secret = 'sealed', totp_enabled_at = ? WHERE id = ?", t, owner);
  assert.equal(await consumePasswordReset(await createPasswordReset(owner), "another new long password"), owner);
  assert.ok((await q.get<{ on: number | null }>("SELECT totp_enabled_at AS on FROM users WHERE id = ?", owner))!.on, "a confirmed account keeps its two-factor");
});

test("a reset submission with a bad link is refused before the breach check or the hash, and is rate limited", async () => {
  await setup();
  const { resetWithLink } = await import("../src/lib/password-reset");
  let checked = 0;
  const leaked = async () => {
    checked++;
    return null;
  };
  const r = await resetWithLink("not-a-real-token", "a long enough new password", "203.0.113.9", leaked);
  assert.deepEqual(r, { error: "This reset link has expired or was already used. Request a new one." });
  assert.equal(checked, 0, "no outside lookup (and no hash) for a link that doesn't work");
  for (let i = 0; i < 30; i++) await resetWithLink(`bogus-${i}`, "a long enough new password", "203.0.113.9", leaked);
  const limited = await resetWithLink("bogus-last", "a long enough new password", "203.0.113.9", leaked);
  assert.match("error" in limited ? limited.error : "", /Too many/);
  assert.equal(checked, 0);
});
