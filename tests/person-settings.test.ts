import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-person-settings-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const SOURCE = "src/app/dashboard/actions/settings.ts";

async function setup() {
  const { q } = await import("../src/lib/db");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id",
      `${handle}@settings.io`, handle, handle, now, now,
    ))!.id;
  return { q, now, user };
}

const ALERTS = { mode: "instant", digestHour: 8, quietStart: null, quietEnd: null, alerts: true, product: true, marketing: false, tz: "Europe/London" } as const;
const PROFILE = { name: "New Name", firstName: "New", lastName: "Name", kind: "label", kindNote: "", tools: "{}" };

test("the owner saves their own alerts and profile as the person, through the action's own statements", async () => {
  const { q } = await import("../src/lib/db");
  const { saveAlerts, saveProfile } = await import("../src/lib/settings-save");
  const { now, user } = await setup();
  const label = await user("labelset");
  assert.equal(await saveAlerts(label, label, ALERTS, now), null, "alerts saved");
  assert.equal(await saveProfile(label, label, PROFILE), null, "profile saved");
  const row = await q.get<{ notify_submissions: string; digest_hour: number; tz: string; name: string; notify_product: number; product_consent_at: number | null; marketing_consent_at: number | null }>(
    "SELECT notify_submissions, digest_hour, tz, name, notify_product, product_consent_at, marketing_consent_at FROM users WHERE id = ?",
    label,
  );
  assert.deepEqual(row, { notify_submissions: "instant", digest_hour: 8, tz: "Europe/London", name: "New Name", notify_product: 1, product_consent_at: now, marketing_consent_at: null });
  // A consent keeps its first time while still given, and clears when taken back.
  assert.equal(await saveAlerts(label, label, ALERTS, now + 60_000), null);
  assert.equal((await q.get<{ t: number }>("SELECT product_consent_at AS t FROM users WHERE id = ?", label))!.t, now);
  assert.equal(await saveAlerts(label, label, { ...ALERTS, product: false, marketing: true }, now + 120_000), null);
  assert.deepEqual(await q.get("SELECT product_consent_at, marketing_consent_at FROM users WHERE id = ?", label), { product_consent_at: null, marketing_consent_at: now + 120_000 });
});

test("nobody else saves a desk's settings as the person, and the save says so instead of claiming success", async () => {
  const { q } = await import("../src/lib/db");
  const { saveAlerts, saveProfile, NOT_SAVED } = await import("../src/lib/settings-save");
  const { now, user } = await setup();
  const label = await user("deskset");
  const admin = await user("adminset"); // an admin on the label's team, not its owner: owner-only stays owner-only
  const member = await user("memberset");
  const stranger = await user("strangerset");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?), (?, ?, 'member', ?)", label, admin, now, label, member, now);
  for (const who of [admin, member, stranger]) {
    assert.equal(await saveAlerts(who, label, ALERTS, now), NOT_SAVED, `person ${who} can't save the desk's alerts`);
    assert.equal(await saveProfile(who, label, PROFILE), NOT_SAVED, `person ${who} can't save the desk's profile`);
  }
  assert.deepEqual(await q.get("SELECT name, notify_submissions FROM users WHERE id = ?", label), { name: "deskset", notify_submissions: "digest" });
});

test("as the person, money, sign-in, verification, cover and routing columns stay unwritable, even on your own row", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { user } = await setup();
  const me = await user("selfset");
  const cols = (await q.all<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'")).map((c) => c.column_name);
  const fixed = [
    "plan", "email", "handle", "suspended_at", "extra_seats", "password_hash", "totp_secret", "recovery_codes", "google_sub", "email_verified_at",
    "email_verify_token", "pending_email", "pending_email_token", "invite_code", "referral_code", "admin_tags", "cover_key", "active_collection_id",
  ];
  const never = cols.filter((c) => fixed.includes(c) || /^(identity_|reply_)/.test(c));
  for (const c of ["plan", "email", "handle", "suspended_at", "extra_seats", "cover_key", "active_collection_id"]) assert.ok(never.includes(c), `${c} is checked`);
  assert.ok(never.some((c) => c.startsWith("identity_")) && never.some((c) => c.startsWith("reply_")), "identity_* and reply_* are checked");
  for (const c of never) {
    const can = await q.get<{ ok: boolean }>("SELECT has_column_privilege('ft_person', 'users', ?, 'UPDATE') AS ok", c);
    assert.equal(can!.ok, false, `ft_person must not update users.${c}`);
  }
  for (const [col, value] of [["plan", "label"], ["email", "x@evil.io"], ["handle", "takeover"], ["identity_status", "verified"], ["suspended_at", null], ["cover_key", "covers/other.webp"]] as const)
    await assert.rejects(asPerson(me, () => q.run(`UPDATE users SET ${col} = ? WHERE id = ?`, value, me)), /permission denied/i, `${col} refused`);
});

test("Settings saves the owner's own alerts and profile through the person's rules, keeps the rest the app's, and no role changes", () => {
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
  assert.match(body("updateNotifications"), /saveAlerts\(u\.actor_id, u\.id,/);
  assert.match(body("updateNotifications"), /if \(problem\) return \{ error: problem \}/);
  assert.doesNotMatch(body("updateNotifications"), /UPDATE users/, "no write of its own outside the person's rules");
  assert.match(body("updateSettings"), /saveProfile\(u\.actor_id, u\.id,/);
  assert.match(body("updateSettings"), /if \(unsaved\) return \{ error: unsaved \}/);
  for (const name of ["updatePublicPage", "setRerouteClosed"]) assert.match(body(name), /asSystem\(\(\) => q\.run\("UPDATE users SET/, `${name} is the app's on purpose`);
});
