import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-person-settings-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const SOURCE = "src/app/dashboard/actions/settings.ts";

// The writes Settings makes for the owner's own row (src/app/dashboard/actions/settings.ts), as the person.
const NOTIFY =
  "UPDATE users SET notify_submissions = ?, digest_hour = ?, quiet_start = ?, quiet_end = ?, notify_alerts = ?, notify_product = ?, notify_marketing = ?, product_consent_at = ?, marketing_consent_at = ?, tz = ? WHERE id = ?";
const PROFILE = "UPDATE users SET name = ?, first_name = ?, last_name = ?, kind = ?, kind_note = ?, tools = ? WHERE id = ?";

async function setup() {
  const { q } = await import("../src/lib/db");
  const now = Date.now();
  const user = async (handle: string, suspended = false) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at, suspended_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?, ?) RETURNING id",
      `${handle}@settings.io`, handle, handle, now, now, suspended ? now : null,
    ))!.id;
  return { q, now, user };
}

test("the owner saves their own alerts and profile as the person, and only their own", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { now, user } = await setup();
  const label = await user("labelset");
  const admin = await user("adminset"); // an admin on the label's team, not its owner
  const member = await user("memberset");
  const stranger = await user("strangerset");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?), (?, ?, 'member', ?)", label, admin, now, label, member, now);
  const notify = (actor: number, row: number) => asPerson(actor, () => q.run(NOTIFY, "instant", 8, null, null, 1, 1, 0, now, null, "Europe/London", row));
  const profile = (actor: number, row: number) => asPerson(actor, () => q.run(PROFILE, "New Name", "New", "Name", "label", "", "{}", row));

  assert.equal((await notify(label, label)).changes, 1, "the owner saves their own alerts");
  assert.equal((await profile(label, label)).changes, 1, "and their own profile");
  const row = await q.get<{ notify_submissions: string; digest_hour: number; tz: string; name: string; product_consent_at: number | null }>(
    "SELECT notify_submissions, digest_hour, tz, name, product_consent_at FROM users WHERE id = ?",
    label,
  );
  assert.deepEqual(row, { notify_submissions: "instant", digest_hour: 8, tz: "Europe/London", name: "New Name", product_consent_at: now });

  // Nobody else writes the owner's row as the person: not an admin of that team (owner-only stays owner-only), a member
  // or a stranger. The row is filtered out, so nothing changes.
  for (const who of [admin, member, stranger]) {
    assert.equal((await notify(who, label)).changes, 0, `person ${who} can't save the desk's alerts`);
    assert.equal((await profile(who, label)).changes, 0, `person ${who} can't save the desk's profile`);
  }
  assert.equal((await q.get<{ name: string }>("SELECT name FROM users WHERE id = ?", label))!.name, "New Name");
});

test("as the person, money, sign-in and verification columns stay unwritable, even on your own row", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { user } = await setup();
  const me = await user("selfset");
  const cols = (await q.all<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'")).map((c) => c.column_name);
  const fixed = ["plan", "email", "handle", "suspended_at", "extra_seats", "password_hash", "totp_secret", "recovery_codes", "google_sub", "email_verified_at", "email_verify_token", "pending_email", "pending_email_token", "invite_code", "referral_code", "admin_tags"];
  const never = cols.filter((c) => fixed.includes(c) || /^(identity_|reply_)/.test(c));
  for (const c of ["plan", "email", "handle", "suspended_at", "extra_seats"]) assert.ok(never.includes(c), `${c} is checked`);
  assert.ok(never.some((c) => c.startsWith("identity_")) && never.some((c) => c.startsWith("reply_")), "identity_* and reply_* are checked");
  for (const c of never) {
    const can = await q.get<{ ok: boolean }>("SELECT has_column_privilege('ft_person', 'users', ?, 'UPDATE') AS ok", c);
    assert.equal(can!.ok, false, `ft_person must not update users.${c}`);
  }
  // And the database refuses it outright, rather than quietly writing nothing.
  for (const [col, value] of [["plan", "label"], ["email", "x@evil.io"], ["handle", "takeover"], ["identity_status", "verified"], ["suspended_at", null]] as const)
    await assert.rejects(asPerson(me, () => q.run(`UPDATE users SET ${col} = ? WHERE id = ?`, value, me)), /permission denied/i, `${col} refused`);
});

test("a suspended desk's teammate writes nothing on it as the person", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { now, user } = await setup();
  const gone = await user("goneset", true);
  const helper = await user("helperset");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)", gone, helper, now);
  assert.equal((await asPerson(helper, () => q.run(PROFILE, "x", "x", "x", "dj", "", "{}", gone))).changes, 0);
});

test("Settings runs the owner's own saves as the person, keeps the rest the app's on purpose, and no role changes", () => {
  const src = fs.readFileSync(SOURCE, "utf8");
  const body = (name: string) => {
    const start = src.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, `${name} exists`);
    const next = src.indexOf("\nexport ", start + 1);
    return src.slice(start, next < 0 ? undefined : next);
  };
  // The role each action needs is exactly what it was (owner, 5 Nov: team-desk settings stay owner and admins as today).
  const roles: Record<string, string> = {
    updateNotifications: "owner", sendDigestNow: "owner", updateSettings: "owner", updatePublicPage: "admin", setPlan: "owner",
    confirmBetaUpgrade: "owner", identityCode: "owner", submitIdentity: "owner", deleteAccount: "owner", changeMyEmail: "owner",
    cancelMyEmailChange: "owner", requestPlan: "owner", withdrawPlanRequest: "owner", setRerouteClosed: "admin",
  };
  for (const [name, role] of Object.entries(roles)) assert.match(body(name), new RegExp(`requireRole\\("${role}"\\)`), `${name} still needs ${role}`);
  // The owner's own saves go through the person's rules.
  assert.match(body("updateNotifications"), /asPerson\(u\.actor_id, \(\) => q\.run\(\s*`UPDATE users SET notify_submissions/);
  assert.match(body("updateSettings"), /asPerson\(u\.actor_id, \(\) =>\s*q\.run\("UPDATE users SET name = \?/);
  // The admin actions stay the app's, on purpose and said so.
  for (const name of ["updatePublicPage", "setRerouteClosed"]) assert.match(body(name), /asSystem\(\(\) => q\.run\("UPDATE users SET/, `${name} is the app's on purpose`);
});
