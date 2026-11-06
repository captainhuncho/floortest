import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database, no coming-soon gate, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-single-use-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.SITE_PASSWORD;
process.env.ADMIN_EMAILS = "teamdesk@x.io"; // teams are on for this desk only (teamsOn)
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const SITE = "https://floortest.app";
const DAY = 86_400_000;

async function addUser(email: string, handle: string, inviteCode: string | null = null) {
  const { q } = await import("../src/lib/db");
  return (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, invite_code, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?, ?) RETURNING id",
    email, handle, handle, inviteCode, Date.now(),
  ))!.id;
}

async function invite(code: string, email: string, o: { expires?: number | null; used?: number | null } = {}) {
  const { q } = await import("../src/lib/db");
  await q.run(
    "INSERT INTO invites (code, max_uses, note, email, created_at, expires_at, used_at) VALUES (?, 1, '', ?, ?, ?, ?)",
    code, email, Date.now(), o.expires === undefined ? Date.now() + 14 * DAY : o.expires, o.used ?? null,
  );
}

async function openLink(code: string) {
  const { GET } = await import("../src/app/invite/[code]/route");
  const res = await GET(new Request(`${SITE}/invite/${code}`), { params: Promise.resolve({ code }) } as RouteContext<"/invite/[code]">);
  return new URL(res.headers.get("location")!).pathname;
}

test("a personal invite is used once: claimed in the sign-up transaction, and a second claim loses", async () => {
  const { q } = await import("../src/lib/db");
  const { claimPersonalInvite, resolveInvite } = await import("../src/lib/invites");
  await invite("FLOOR-ONCE234567", "once@x.io");
  assert.equal((await resolveInvite("FLOOR-ONCE234567", "once@x.io", false)).valid, true);
  assert.equal(await q.tx((db) => claimPersonalInvite(db, "FLOOR-ONCE234567", "once@x.io")), true, "the first sign-up claims it");
  assert.equal(await q.tx((db) => claimPersonalInvite(db, "FLOOR-ONCE234567", "once@x.io")), false, "a racing second sign-up is refused and rolls back");
  assert.equal((await resolveInvite("FLOOR-ONCE234567", "once@x.io", false)).valid, false, "used before any account row exists");
});

test("deleting the account made with an invite never brings the invite back", async () => {
  const { q } = await import("../src/lib/db");
  const { claimPersonalInvite, resolveInvite, liveInviteCode, personalInviteGone } = await import("../src/lib/invites");
  await invite("FLOOR-BACK234567", "back@x.io");
  const id = await addUser("back@x.io", "backdesk", "FLOOR-BACK234567");
  await q.tx((db) => claimPersonalInvite(db, "FLOOR-BACK234567", "back@x.io"));
  await q.run("DELETE FROM users WHERE id = ?", id);
  assert.equal((await resolveInvite("FLOOR-BACK234567", "back@x.io", false)).valid, false, "can't sign up again with it");
  assert.equal(await liveInviteCode("FLOOR-BACK234567"), false, "can't open the coming-soon gate with it");
  assert.equal(await personalInviteGone("FLOOR-BACK234567"), true, "the link says it's used");
});

test("signing up any other way marks every invite waiting for that email used", async () => {
  const { q } = await import("../src/lib/db");
  const { claimPersonalInvite, personalInviteGone } = await import("../src/lib/invites");
  await invite("FLOOR-OTHR234567", "other@x.io");
  await q.tx((db) => claimPersonalInvite(db, null, "Other@X.io"));
  assert.equal(await personalInviteGone("FLOOR-OTHR234567"), true);
});

test("an unused personal invite lasts 14 days, and Ops can see it expired", async () => {
  const { resolveInvite, liveInviteCode, personalInviteGone, inviteExpiry, INVITE_DAYS } = await import("../src/lib/invites");
  assert.equal(INVITE_DAYS, 14);
  assert.equal(inviteExpiry(1000), 1000 + 14 * DAY);
  await invite("FLOOR-OLDX234567", "late@x.io", { expires: Date.now() - 1 });
  await invite("FLOOR-NEWX234567", "fresh@x.io");
  assert.equal((await resolveInvite("FLOOR-OLDX234567", "late@x.io", false)).valid, false, "expired: no account");
  assert.equal((await resolveInvite("", "late@x.io", false, { emailProven: true })).valid, false, "expired: not through Google either");
  assert.equal(await liveInviteCode("FLOOR-OLDX234567"), false);
  assert.equal(await personalInviteGone("FLOOR-OLDX234567"), true);
  assert.equal((await resolveInvite("FLOOR-NEWX234567", "fresh@x.io", false)).valid, true, "inside 14 days: works");
  assert.equal(await personalInviteGone("FLOOR-NEWX234567"), false);
  assert.equal(await personalInviteGone("FLOOR-NOSUCH4567"), false, "an unknown code never showed an invite");
});

test("the invite link sends a used, expired or already-joined invite to 'used', never to a live form", async () => {
  await invite("FLOOR-LINK234567", "link@x.io");
  await invite("FLOOR-USED234567", "used@x.io", { used: Date.now() });
  await invite("FLOOR-GONE234567", "gone@x.io", { expires: Date.now() - 1 });
  await invite("FLOOR-HASA234567", "hasacct@x.io");
  await addUser("hasacct@x.io", "hasacct");
  assert.equal(await openLink("FLOOR-LINK234567"), "/signup", "a live invite opens sign-up");
  for (const code of ["FLOOR-USED234567", "FLOOR-GONE234567", "FLOOR-HASA234567"]) assert.equal(await openLink(code), "/invite/used", code);

});

test("Ops: restoring a used invite is refused; restoring an unused one gives a fresh 14 days", async () => {
  const { q } = await import("../src/lib/db");
  const { restoreRevokedInvite } = await import("../src/lib/invites");
  await invite("FLOOR-RSTU234567", "rstu@x.io", { used: Date.now() });
  await invite("FLOOR-RSTF234567", "rstf@x.io", { expires: Date.now() - DAY });
  await q.run("UPDATE invites SET revoked_at = ? WHERE code IN ('FLOOR-RSTU234567', 'FLOOR-RSTF234567')", Date.now());
  assert.equal((await restoreRevokedInvite("FLOOR-RSTU234567")).ok, false);
  assert.equal((await restoreRevokedInvite("FLOOR-RSTF234567")).ok, true);
  const row = await q.get<{ expires_at: number }>("SELECT expires_at FROM invites WHERE code = 'FLOOR-RSTF234567'");
  assert.ok(row!.expires_at > Date.now() + 13 * DAY);
});

test("migration 0131 marks invites already used, and times waiting ones from when they were sent (so a deleted account's invite stays dead)", async () => {
  const { q } = await import("../src/lib/db");
  const { MIGRATIONS } = await import("../src/lib/db/migrations");
  const step = MIGRATIONS.find((m) => m.id === "0131_invite_used_expires")!;
  const raw = (code: string, email: string, sent = Date.now()) => q.run("INSERT INTO invites (code, max_uses, note, email, created_at, sent_at) VALUES (?, 1, '', ?, ?, ?)", code, email, sent, sent);
  await raw("FLOOR-MIGA234567", "miga@x.io"); // used by its code
  await addUser("miga@x.io", "migadesk", "FLOOR-MIGA234567");
  await raw("FLOOR-MIGB234567", "migb@x.io"); // its email signed up another way
  await addUser("migb@x.io", "migbdesk");
  await raw("FLOOR-MIGC234567", "migc@x.io"); // still waiting, sent today
  await raw("FLOOR-MIGD234567", "migd@x.io", Date.now() - 30 * DAY); // sent a month ago: its account may have been deleted, leaving no trace
  await q.run("INSERT INTO invites (code, max_uses, note, created_at) VALUES ('MIG-SHARED', 25, '', ?)", Date.now());
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, kind, email_verify_token, created_at) VALUES ('ver@x.io', 'h', 'V', 'verdesk', 'free', null, 'hash', ?)", Date.now());
  for (const stmt of step.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q.run(stmt);
  const get = (code: string) => q.get<{ used_at: number | null; expires_at: number | null }>("SELECT used_at, expires_at FROM invites WHERE code = ?", code);
  assert.ok((await get("FLOOR-MIGA234567"))!.used_at);
  assert.ok((await get("FLOOR-MIGB234567"))!.used_at);
  const c = (await get("FLOOR-MIGC234567"))!;
  assert.equal(c.used_at, null);
  assert.ok(c.expires_at! > Date.now() + 13 * DAY && c.expires_at! <= Date.now() + 14 * DAY);
  const d = (await get("FLOOR-MIGD234567"))!;
  assert.ok(d.expires_at! < Date.now(), "a month-old invite is already past its 14 days, not given 14 new ones");
  const { resolveInvite } = await import("../src/lib/invites");
  assert.equal((await resolveInvite("FLOOR-MIGD234567", "migd@x.io", false)).valid, false);
  assert.equal((await get("MIG-SHARED"))!.expires_at, null, "shared codes keep no expiry");
  const v = await q.get<{ email_verify_sent_at: number | null }>("SELECT email_verify_sent_at FROM users WHERE handle = 'verdesk'");
  assert.ok(v!.email_verify_sent_at, "a confirmation link already sent gets 48 hours from today");
});

test("an email confirmation link lasts 48 hours", async () => {
  const { q } = await import("../src/lib/db");
  const { confirmEmail } = await import("../src/lib/accounts");
  const { hashToken } = await import("../src/lib/token-hash");
  const id = await addUser("conf@x.io", "confdesk");
  await q.run("UPDATE users SET email_verify_token = ?, email_verify_sent_at = ? WHERE id = ?", hashToken("old-link"), Date.now() - 49 * 3_600_000, id);
  assert.equal(await confirmEmail("old-link", id), undefined, "past 48 hours: refused");
  await q.run("UPDATE users SET email_verify_token = ?, email_verify_sent_at = ? WHERE id = ?", hashToken("new-link"), Date.now(), id);
  assert.ok(await confirmEmail("new-link", id), "inside 48 hours: confirms");
});

test("a password change also ends emailed sign-in codes, half-finished two-step sign-ins and a pending email change", async () => {
  const { q } = await import("../src/lib/db");
  const { revokeAllSessions } = await import("../src/lib/sessions");
  const id = await addUser("pw@x.io", "pwdesk");
  const t = Date.now();
  await q.run("INSERT INTO login_codes (user_id, code_hash, attempts, expires_at, created_at) VALUES (?, 'x', 0, ?, ?)", id, t + 600_000, t);
  await q.run("INSERT INTO two_step_tickets (id_hash, user_id, expires_at) VALUES ('tk', ?, ?)", id, t + 300_000);
  await q.run("UPDATE users SET pending_email = 'new@x.io', pending_email_token = 'h', pending_email_at = ? WHERE id = ?", t, id);
  await revokeAllSessions(id);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM login_codes WHERE user_id = ?", id), 0);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM two_step_tickets WHERE user_id = ?", id), 0);
  const u = await q.get<{ pending_email: string | null; pending_email_token: string | null }>("SELECT pending_email, pending_email_token FROM users WHERE id = ?", id);
  assert.deepEqual(u, { pending_email: null, pending_email_token: null });
});

test("a personal invite written without an expiry (an old build during a deploy) still ends 14 days after it was made", async () => {
  const { q } = await import("../src/lib/db");
  const { resolveInvite, liveInviteCode } = await import("../src/lib/invites");
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES ('FLOOR-NULL234567', 1, '', 'null@x.io', ?)", Date.now() - 15 * DAY);
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES ('FLOOR-NULF234567', 1, '', 'nulf@x.io', ?)", Date.now() - DAY);
  assert.equal((await resolveInvite("FLOOR-NULL234567", "null@x.io", false)).valid, false);
  assert.equal(await liveInviteCode("FLOOR-NULL234567"), false);
  assert.equal((await resolveInvite("FLOOR-NULF234567", "nulf@x.io", false)).valid, true);
});

test("Undo of a same-code resend puts the invite's old expiry back", async () => {
  const { q } = await import("../src/lib/db");
  const { revertItem } = await import("../src/lib/ops-undo");
  const old = Date.now() + 2 * DAY;
  await invite("FLOOR-UNDO234567", "undo@x.io", { expires: Date.now() + 14 * DAY });
  await q.tx((db) => revertItem(db, { kind: "invite_resend", items: [], mail: [], admin: 1, exp: Date.now() + 60_000 }, { code: "FLOOR-UNDO234567", at: old }));
  assert.equal((await q.get<{ expires_at: number }>("SELECT expires_at FROM invites WHERE code = 'FLOOR-UNDO234567'"))!.expires_at, old);
});

test("the invite link counts tries before looking anything up, gate or not", async () => {
  await invite("FLOOR-RATE234567", "rate@x.io", { used: Date.now() });
  const first = await openLink("FLOOR-RATE234567");
  assert.equal(first, "/invite/used");
  for (let i = 0; i < 25; i++) await openLink("FLOOR-NOPE" + String(i).padStart(6, "0"));
  assert.equal(await openLink("FLOOR-RATE234567"), "/signup", "past the limit it answers without a lookup (sign-up then does its own check)");
});

test("sign-up claims the invite inside the account transaction and rolls back when it was claimed first", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/(auth)/actions.ts", import.meta.url), "utf8");
  const tx = src.slice(src.indexOf("return await q.tx(async (db) => {"), src.indexOf("} catch (e) {", src.indexOf("return await q.tx(async (db) => {")));
  assert.match(tx, /INSERT INTO users/);
  assert.match(tx, /claimPersonalInvite\(db, invite\.valid && invite\.personal \? invite\.code : null, a\.email\)/, "the claim runs in the same transaction as the account");
  assert.match(tx, /throw INVITE_GONE/, "a lost claim rolls the account back");
  assert.match(src, /if \(e === INVITE_GONE\) return \{ error: "This invite has been used or has expired/);
});

test("a team invite accepted twice at once: one wins, the other is refused", async () => {
  const { q } = await import("../src/lib/db");
  const { acceptInvite } = await import("../src/lib/account-members");
  const crypto = await import("node:crypto");
  const desk = await addUser("teamdesk@x.io", "teamdesk");
  const mate = await addUser("mate@x.io", "matedesk");
  await q.run("UPDATE users SET email_verified_at = ? WHERE id = ?", Date.now(), mate);
  const secret = "team-secret-for-race-test";
  await q.run(
    "INSERT INTO account_invites (account_id, email, role, token_hash, created_at, expires_at) VALUES (?, 'mate@x.io', 'member', ?, ?, ?)",
    desk, crypto.createHash("sha256").update(secret, "utf8").digest("hex"), Date.now(), Date.now() + DAY,
  );
  const person = { id: mate, email: "mate@x.io", email_verified_at: Date.now() };
  const results = await Promise.allSettled([acceptInvite(secret, person), acceptInvite(secret, person)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "used once");
  assert.equal(results.filter((r) => r.status === "rejected").length, 1, "the second accept loses at the guarded update");
});

test("sending a confirmation email stamps when it went, so the 48 hours can be counted", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/lib/security.ts", import.meta.url), "utf8");
  assert.match(src, /UPDATE users SET email_verify_token = \?, email_verify_sent_at = \? WHERE id = \? AND email_verified_at IS NULL/);
});

test("pages that honour a link check it too: verify-email's 48 hours, sign-up's dead invite and dead team invite", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const verify = read("src/app/verify-email/[token]/page.tsx");
  assert.match(verify, /email_verify_token = \? AND email_verify_sent_at > \?/, "the page treats a link past 48 hours as not recognised");
  assert.match(verify, /verifyLinkCutoff\(\)/);
  const signup = read("src/app/(auth)/signup/page.tsx");
  assert.match(signup, /if \(inviteCode && \(await personalInviteGone\(inviteCode\)\)\) redirect\("\/invite\/used"\)/, "a dead personal invite never shows the form");
  assert.match(signup, /if \(sp\.team && !team\) redirect\(`\/join\//, "a dead team invite goes to the join page, which says so");
  const auth = read("src/app/(auth)/actions.ts");
  const tx = auth.slice(auth.indexOf("return await q.tx(async (db) => {"), auth.indexOf("} catch (e) {", auth.indexOf("return await q.tx(async (db) => {")));
  assert.match(tx, /UPDATE account_invites SET accepted_at = \? WHERE id = \? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > \? RETURNING/, "the team invite is accepted in the account transaction");
  assert.match(tx, /else if \(!open && !invite\.valid\) throw TEAM_GONE/, "when the team invite was what let them in, a lost accept rolls the account back");
});
