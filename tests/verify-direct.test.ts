import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load. No email key: mail is
// queued in the outbox and not sent anywhere.
process.env.DATA_DIR = testDataDir("ft-verify-direct-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("ops verify someone directly: needs a reason and proof, refuses verified, suspended and unconfirmed, logs it and emails without a code", async () => {
  const { q } = await import("../src/lib/db");
  const { findToVerify } = await import("../src/lib/identity-direct");
  const V = await import("../src/lib/verification-proposals");
  const direct = { super: false as const, role: "care" as const, perms: new Set(["verification", "verification.direct"] as const) };
  const t = Date.now();
  const user = async (handle: string, extra: { confirmed?: boolean; suspended?: boolean; status?: string } = {}) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, suspended_at, identity_status, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?, ?, ?, ?) RETURNING id",
      `${handle}@verify.io`, `${handle} Name`, handle, extra.confirmed === false ? null : t, extra.suspended ? t : null, extra.status ?? "none", t,
    ))!.id;
  const staffId = await user("opsstaff");
  const staff = { id: staffId, access: direct };
  const proof = (reason: string) => ({ reason, links: "https://instagram.com/knownlabel", tickets: [] });
  const verifyDirect = (actor: typeof staff, id: number, reason: string) => V.verifyDirect(actor, id, proof(reason));
  const label = await user("knownlabel");
  const done = await user("alreadyset", { status: "verified" });
  const off = await user("suspendedone", { suspended: true });
  const fresh = await user("unconfirmed", { confirmed: false });
  const state = (id: number) => q.get<{ identity_status: string; identity_verified_at: number | null; identity_note: string }>("SELECT identity_status, identity_verified_at, identity_note FROM users WHERE id = ?", id);

  // A reason is required: 10–500 characters.
  assert.match((await verifyDirect(staff, label, " ") as { why: string }).why, /at least 10 characters/);
  assert.equal((await verifyDirect(staff, label, "x".repeat(501))).ok, false);
  assert.equal((await state(label))!.identity_status, "none", "nothing changed without a note");

  // Refusals, each with its own reason, and nothing changes.
  assert.match((await verifyDirect(staff, done, "checked their page") as { why: string }).why, /already verified/);
  assert.match((await verifyDirect(staff, off, "checked their page") as { why: string }).why, /suspended/);
  assert.match((await verifyDirect(staff, fresh, "checked their page") as { why: string }).why, /confirmed their email/);
  assert.match((await verifyDirect(staff, 999_999, "checked their page") as { why: string }).why, /not found/);
  assert.equal((await state(off))!.identity_status, "none");
  assert.equal((await state(fresh))!.identity_status, "none");

  // A 'none' account: verified now, the note kept, the admin log written, one email without a code.
  const r = await verifyDirect(staff, label, "  known label,   checked their Instagram ");
  assert.equal(r.ok, true);
  assert.equal((r as { handle: string }).handle, "knownlabel");
  const s = (await state(label))!;
  assert.equal(s.identity_status, "verified");
  assert.ok(s.identity_verified_at && s.identity_verified_at >= t);
  assert.equal(s.identity_note, "known label, checked their Instagram");
  const log = await q.all<{ admin_id: number; action: string; target: string; detail: string }>("SELECT admin_id, action, target, detail FROM admin_log WHERE target = '@knownlabel'");
  assert.deepEqual(log, [{ admin_id: staffId, action: "verified identity (no request)", target: "@knownlabel", detail: `proposal #${(r as { id: number }).id}: known label, checked their Instagram` }]);
  const mail = await q.all<{ subject: string; body: string }>("SELECT subject, body FROM outbox WHERE lower(to_email) = 'knownlabel@verify.io'");
  assert.equal(mail.length, 1);
  assert.equal(mail[0].subject, "You're verified on FloorTest");
  assert.match(mail[0].body, /now shows the Verified mark next to your name/);
  assert.match(mail[0].body, /The FloorTest team checked your profile and added it\./);
  assert.doesNotMatch(mail[0].body, /code/i, "they never asked, so no bio code is mentioned");
  assert.doesNotMatch(mail[0].body, /Instagram/, "the staff note stays internal");

  // Twice is refused: one verification, one email, one log line.
  assert.match((await verifyDirect(staff, label, "again, checked") as { why: string }).why, /already verified/);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM outbox WHERE lower(to_email) = 'knownlabel@verify.io'"), 1);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM admin_log WHERE target = '@knownlabel'"), 1);

  // Search: by @handle or email, bounded, wildcards taken literally.
  assert.deepEqual((await findToVerify("@knownlab")).map((m) => m.handle), ["knownlabel"]);
  assert.deepEqual((await findToVerify("unconfirmed@verify")).map((m) => m.handle), ["unconfirmed"]);
  assert.deepEqual(await findToVerify("%"), [], "a lone wildcard is too short and matches nothing");
  assert.deepEqual(await findToVerify("%%"), [], "wildcards are matched literally");
  assert.deepEqual(await findToVerify("' OR 1=1 --"), []);
  for (let i = 0; i < 12; i++) await user(`bulk${i}`);
  assert.equal((await findToVerify("bulk")).length, 10, "at most 10 results");
});

test("the verified email: one template, the right line for a request and for a direct check, nothing left unfilled", async () => {
  const { verifiedEmail } = await import("../src/lib/identity-direct");
  const { EMAILS, fillEmail } = await import("../src/lib/email-copy");
  const who = { name: "Ama Mensah", handle: "ama" };
  const request = await verifiedEmail(who, "request");
  const direct = await verifiedEmail(who, "direct");
  for (const e of [request, direct]) {
    assert.equal(e.subject, "You're verified on FloorTest");
    assert.match(e.body, /^Hi Ama,\n\n/);
    assert.match(e.body, /\n\nSee your page: http\S+\/ama\n\n/);
    assert.doesNotMatch(e.subject + e.body, /[{}]/, "no fill-in left over");
  }
  assert.match(request.body, /You can remove the code from your bio now\./);
  assert.doesNotMatch(request.body, /team checked your profile/);
  assert.match(direct.body, /You didn't need to do anything\. The FloorTest team checked your profile and added it\./);
  assert.doesNotMatch(direct.body, /code/i);
  // An empty whole-paragraph fill-in leaves no gap: one blank line between paragraphs, never two.
  const empty = fillEmail(EMAILS.verified.body, { first_name: "Ama", link: "https://x/ama", how_line: "" });
  assert.doesNotMatch(empty, /\n{3,}/);
  assert.match(empty, /real you\.\n\nSee your page:/);
});

test("verifying directly needs verification.direct, which no role has by default", async () => {
  const { ACTION_NEEDS, ROLE_PERMS, has } = await import("../src/lib/ops-perms");
  assert.equal(ACTION_NEEDS.verifyDirectly, "verification.direct");
  for (const role of Object.values(ROLE_PERMS)) {
    assert.ok(!role.includes("verification.direct" as never) && !role.includes("verification.approve" as never), "never a role default");
  }
  assert.ok(has(new Set(ROLE_PERMS.care), "verification"), "Customer Care can propose");
  assert.ok(!has(new Set(ROLE_PERMS.care), "verification.direct"), "but not verify directly");
  assert.ok(!has(new Set(ROLE_PERMS.developer), "verification"), "Developer can't");
  const src = fs.readFileSync(new URL("../src/app/admin/actions.ts", import.meta.url), "utf8");
  const action = src.split(/^(?=export async function )/m).find((p) => p.startsWith("export async function verifyDirectly("))!;
  assert.match(action, /requireAdminAction\("verification\.direct"\)/, "checked on the server before anything else");
  assert.ok(action.indexOf('requireAdminAction("verification.direct")') < action.indexOf("verifyDirect("));
});
