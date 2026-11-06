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
  const { user } = await setup();
  const label = await user("labelset");
  const times = () => q.get<{ p: number | null; m: number | null }>("SELECT product_consent_at AS p, marketing_consent_at AS m FROM users WHERE id = ?", label);
  const before = Date.now();
  assert.equal(await saveAlerts(label, label, { ...ALERTS, product: true, marketing: true }), null, "alerts saved");
  assert.equal(await saveProfile(label, label, PROFILE), null, "profile saved");
  const row = await q.get<{ notify_submissions: string; digest_hour: number; tz: string; name: string; notify_product: number; notify_marketing: number }>(
    "SELECT notify_submissions, digest_hour, tz, name, notify_product, notify_marketing FROM users WHERE id = ?",
    label,
  );
  assert.deepEqual(row, { notify_submissions: "instant", digest_hour: 8, tz: "Europe/London", name: "New Name", notify_product: 1, notify_marketing: 1 });
  // Both consents get a time when given, set by the database in the same statement.
  const first = (await times())!;
  for (const t of [first.p, first.m]) assert.ok(t !== null && t >= before - 1000 && t <= Date.now() + 1000, `a consent time is set: ${t}`);
  // Saving again while still given keeps each first time, for the newsletter and for offers alike.
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(await saveAlerts(label, label, { ...ALERTS, product: true, marketing: true }), null);
  assert.deepEqual(await times(), first, "both first times kept on a second save");
  // Taking one back clears only that one; the other keeps its first time.
  assert.equal(await saveAlerts(label, label, { ...ALERTS, product: false, marketing: true }), null);
  assert.deepEqual(await times(), { p: null, m: first.m });
  assert.equal(await saveAlerts(label, label, { ...ALERTS, product: false, marketing: false }), null);
  assert.deepEqual(await times(), { p: null, m: null }, "offers consent cleared when taken back");
  // Given again later: a new time, not the old one.
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(await saveAlerts(label, label, { ...ALERTS, product: false, marketing: true }), null);
  assert.ok((await times())!.m! > first.m!, "a fresh time after giving it again");
});

test("only the database sets consent times: a written time is refused as the person and ignored from the app", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { user } = await setup();
  const me = await user("triggerset");
  const time = async () => (await q.get<{ t: number | null }>("SELECT marketing_consent_at AS t FROM users WHERE id = ?", me))!.t;
  // As the person, the time columns can't be written at all.
  await assert.rejects(asPerson(me, () => q.run("UPDATE users SET marketing_consent_at = 1 WHERE id = ?", me)), /permission denied/i);
  await assert.rejects(asPerson(me, () => q.run("UPDATE users SET product_consent_at = 1 WHERE id = ?", me)), /permission denied/i);
  // From the app's own connection: a time without consent doesn't stick, and with consent it's the database's own.
  await q.run("UPDATE users SET marketing_consent_at = 12345 WHERE id = ?", me);
  assert.equal(await time(), null, "no consent, no time");
  await q.run("UPDATE users SET notify_marketing = 1, marketing_consent_at = 1 WHERE id = ?", me);
  const given = (await time())!;
  assert.ok(given > 1_000_000_000_000, "the database's time, not the statement's");
  await q.run("UPDATE users SET marketing_consent_at = 12345 WHERE id = ?", me);
  assert.equal(await time(), given, "a later forged time is ignored while consent stands");
  // Taken back clears it, even if a stale time is pushed in afterwards; opting in again gives a fresh time.
  await q.run("UPDATE users SET notify_marketing = 0 WHERE id = ?", me);
  assert.equal(await time(), null);
  await q.run("UPDATE users SET marketing_consent_at = 12345 WHERE id = ?", me);
  assert.equal(await time(), null, "no stale time while withdrawn");
  await new Promise((r) => setTimeout(r, 15));
  await q.run("UPDATE users SET notify_marketing = 1 WHERE id = ?", me);
  assert.ok((await time())! > given, "a fresh time on opting in again");
  // Unsubscribing (src/lib/unsubscribe.ts) still ends at no consent and no time.
  const { UNSUB_KINDS } = await import("../src/lib/unsubscribe");
  await q.run(UNSUB_KINDS.marketing.sql, me);
  assert.deepEqual(await q.get("SELECT notify_marketing, marketing_consent_at FROM users WHERE id = ?", me), { notify_marketing: 0, marketing_consent_at: null });
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
    assert.equal(await saveAlerts(who, label, ALERTS), NOT_SAVED, `person ${who} can't save the desk's alerts`);
    assert.equal(await saveProfile(who, label, PROFILE), NOT_SAVED, `person ${who} can't save the desk's profile`);
  }
  assert.deepEqual(await q.get("SELECT name, notify_submissions FROM users WHERE id = ?", label), { name: "deskset", notify_submissions: "digest" });
});

test("as the person, money, sign-in, verification, cover, routing, public page and pause columns stay unwritable, even on your own row", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { user } = await setup();
  const me = await user("selfset");
  const cols = (await q.all<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'")).map((c) => c.column_name);
  const fixed = [
    "plan", "email", "handle", "suspended_at", "extra_seats", "password_hash", "totp_secret", "recovery_codes", "google_sub", "email_verified_at",
    "email_verify_token", "pending_email", "pending_email_token", "invite_code", "referral_code", "admin_tags", "cover_key", "active_collection_id",
    "links", "role_line", "page_style", "paused_at", "pause_until", "pause_message",
  ];
  const never = cols.filter((c) => fixed.includes(c) || /^(identity_|reply_)/.test(c));
  for (const c of ["plan", "email", "handle", "suspended_at", "extra_seats", "cover_key", "active_collection_id", "links", "pause_message"]) assert.ok(never.includes(c), `${c} is checked`);
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

test("consent times at sign-up are the database's too", async () => {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const row = await q.get<{ p: number | null; m: number | null }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, notify_product, product_consent_at, notify_marketing, marketing_consent_at) VALUES ('signup@settings.io', 'h', 'S', 'signupset', 'free', 'UTC', ?, 1, 1, 0, 5) RETURNING product_consent_at AS p, marketing_consent_at AS m",
    t,
  );
  assert.ok(row!.p! >= t - 1000, "a yes gets the database's time, not the one supplied");
  assert.equal(row!.m, null, "a no gets no time, even if one is supplied");
});

test("a save that fails shows the message instead of an error page, and ops hear about it", async () => {
  const { q } = await import("../src/lib/db");
  const { saveAlerts, NOT_SAVED } = await import("../src/lib/settings-save");
  const { user } = await setup();
  const me = await user("failset");
  const incidents = async () => (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM incidents"))!.n;
  const before = await incidents();
  // An hour far out of range makes the database refuse the write.
  assert.equal(await saveAlerts(me, me, { ...ALERTS, digestHour: 1e12 }), NOT_SAVED);
  assert.equal(await incidents(), before + 1);
});
