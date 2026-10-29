import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-invites-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.BETA_INVITE_CODES = "SHARED-ENV";
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("sign-up closed: only a personal invite, with its emailed code, for that exact email opens an account", async () => {
  const { q } = await import("../src/lib/db");
  const { resolveInvite } = await import("../src/lib/invites");
  const t = Date.now();
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, referral_code, created_at) VALUES ('ref@x.io', 'h', 'R', 'refdesk', 'free', 'UTC', 'REFCODE', ?)", t);
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES ('PERSONAL1', 1, '', 'ana@x.io', ?)", t);
  await q.run("INSERT INTO invites (code, max_uses, note, created_at) VALUES ('GROUP', 25, '', ?)", t);

  assert.equal((await resolveInvite("", "Ana@X.io", false)).valid, false, "the email alone isn't enough: anyone can type someone else's email");
  assert.deepEqual(await resolveInvite("personal1", "Ana@X.io", false), { valid: true, referrerId: null, code: "PERSONAL1" }, "the code from the invite link opens it");
  assert.equal((await resolveInvite("", "ana@x.io", false, { emailProven: true })).valid, true, "an email already proven (Google) needs no code");
  assert.equal((await resolveInvite("PERSONAL1", "bob@x.io", false)).valid, false, "someone else's invite code doesn't");
  assert.equal((await resolveInvite("", "bob@x.io", false)).valid, false, "no invite for this email");
  assert.equal((await resolveInvite("GROUP", "bob@x.io", false)).valid, false, "a shared Ops code doesn't");
  assert.equal((await resolveInvite("SHARED-ENV", "bob@x.io", false)).valid, false, "a code from BETA_INVITE_CODES doesn't");
  assert.equal((await resolveInvite("REFCODE", "bob@x.io", false)).valid, false, "a referral code doesn't");

  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, invite_code, created_at) VALUES ('ana@x.io', 'h', 'A', 'ana', 'free', 'UTC', 'PERSONAL1', ?)", t);
  assert.equal((await resolveInvite("PERSONAL1", "ana@x.io", false)).valid, false, "a used invite is used up");
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at, revoked_at) VALUES ('GONE', 1, '', 'cy@x.io', ?, ?)", t, t);
  assert.equal((await resolveInvite("GONE", "cy@x.io", false)).valid, false, "a revoked invite doesn't");
});

test("sign-up open: codes still record who referred or invited the person", async () => {
  const { resolveInvite } = await import("../src/lib/invites");
  const { q } = await import("../src/lib/db");
  const referrer = (await q.get<{ id: number }>("SELECT id FROM users WHERE referral_code = 'REFCODE'"))!.id;
  assert.deepEqual(await resolveInvite("refcode", "dee@x.io", true), { valid: true, referrerId: referrer, code: "REFCODE" });
  assert.equal((await resolveInvite("GROUP", "dee@x.io", true)).valid, true);
  assert.equal((await resolveInvite("SHARED-ENV", "dee@x.io", true)).valid, true);
  assert.equal((await resolveInvite("", "dee@x.io", true)).valid, false, "no code: nothing to record");
});

test("the coming-soon gate opens only for a live personal invite code", async () => {
  const { liveInviteCode } = await import("../src/lib/invites");
  const { q } = await import("../src/lib/db");
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES ('FLOOR-FRESH23456', 1, '', 'eve@x.io', ?)", Date.now());
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES ('FLOOR-OLD234', 1, '', 'old@x.io', ?)", Date.now());
  assert.equal(await liveInviteCode("floor-fresh23456"), true, "a sent, unused personal invite");
  assert.equal(await liveInviteCode("FLOOR-OLD234"), false, "an old short code, still live, doesn't open the gate");
  assert.equal(await liveInviteCode("PERSONAL1"), false, "used up");
  assert.equal(await liveInviteCode("GONE"), false, "revoked");
  assert.equal(await liveInviteCode("GROUP"), false, "a shared Ops code");
  assert.equal(await liveInviteCode("SHARED-ENV"), false, "a code from BETA_INVITE_CODES");
  assert.equal(await liveInviteCode("REFCODE"), false, "a referral code");
  assert.equal(await liveInviteCode("NOPE"), false, "unknown");
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('Eve@X.io', 'h', 'E', 'eve', 'free', 'UTC', ?)", Date.now());
  assert.equal(await liveInviteCode("FLOOR-FRESH23456"), false, "expired once its email has an account, however they signed up");
  assert.equal(await liveInviteCode("' OR 1=1 --"), false, "injection-shaped input");
  assert.equal(await liveInviteCode(""), false, "empty");
});
