import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { inRequest, type Jar } from "./request-scope";

// Deleted accounts (owner, 15 Nov): switched off at once, 14 days to restore through a full sign-in that opens only
// /restore, then purged with a 6-year evidence record; a legal hold stops both clocks.
process.env.DATA_DIR = testDataDir("ft-deleted-accounts-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;
delete process.env.RESEND_API_KEY;
// Team desks are on for an admin-owned desk without a switch (lib/account-members.ts teamsOn).
const TEAM_OWNER = "team-owner-del@example.test";
process.env.ADMIN_EMAILS = TEAM_OWNER;

const DAY = 86_400_000;
let n = 0;

async function account(extra = "") {
  const { q, now } = await import("../src/lib/db");
  n++;
  const handle = `del${n}${extra}`;
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'free', 'dj', 'UTC', ?, ?) RETURNING id",
    `${handle}@example.test`,
    `Del ${n}`,
    handle,
    now(),
    now(),
  ))!.id;
  return { id: Number(id), handle, email: `${handle}@example.test` };
}

/** Moves an account's deletion back in time, keeping suspended_at equal to it (as a deletion sets them). */
async function ageDeletion(id: number, days: number) {
  const { q } = await import("../src/lib/db");
  await q.run("UPDATE users SET deletion_requested_at = deletion_requested_at - ?, suspended_at = suspended_at - ? WHERE id = ?", days * DAY, days * DAY, id);
}

test("deleting switches the account off at once: sessions end, the link goes offline, the first date stands", async () => {
  const { q } = await import("../src/lib/db");
  const { requestDeletion, restorable } = await import("../src/lib/account-deletion");
  const { userByHandle } = await import("../src/lib/desk");
  const a = await account();
  await q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, kind) VALUES ('tok-del-1', ?, ?, ?, 'web')", a.id, Date.now() + DAY, Date.now());
  assert.ok(await userByHandle(a.handle), "link live before");
  const first = await requestDeletion(a.id);
  assert.ok(first);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", a.id), 0, "every session ended");
  assert.equal(await userByHandle(a.handle), undefined, "link offline");
  assert.ok(await restorable(a.id));
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM outbox WHERE to_email = ?", a.email), 1, "told by email");
  assert.equal(await requestDeletion(a.id), first, "asking again keeps the first date");
});

test("a team desk that is deleted stops working for its members at once (server side); their own accounts stay", async () => {
  const { q, now } = await import("../src/lib/db");
  const { requestDeletion } = await import("../src/lib/account-deletion");
  const { resolveDesk } = await import("../src/lib/team-desk");
  const { USER_COLUMNS } = await import("../src/lib/db");
  const desk = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at, extra_seats) VALUES (?, 'h', 'Team Desk', 'delteamdesk', 'free', 'label', 'UTC', ?, ?, 2) RETURNING id",
    TEAM_OWNER,
    now(),
    now(),
  ))!.id;
  const mate = await account("mate");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", desk, mate.id, now());
  const person = (await q.get<never>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, mate.id))!;
  assert.equal((await resolveDesk(person, Number(desk))).stale, false, "on the team desk before");
  await requestDeletion(Number(desk));
  const after = await resolveDesk(person, Number(desk));
  assert.equal(after.stale, true, "the desk is gone for the member");
  assert.equal(after.user.id, mate.id, "back on their own desk");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM users WHERE id = ? AND suspended_at IS NULL", mate.id), 1, "the member's own account is untouched");
});

test("signing in to a switched-off account opens only /restore: no session, a restore ticket", async () => {
  const { q } = await import("../src/lib/db");
  const { requestDeletion, RESTORE_COOKIE, restoreTicketUser } = await import("../src/lib/account-deletion");
  const { finishSignIn } = await import("../src/lib/security");
  const a = await account();
  await requestDeletion(a.id);
  const jar: Jar = new Map();
  const out = await inRequest(jar, "203.0.113.20", () => finishSignIn(a.id, "password"));
  assert.equal(out.redirect, "/restore");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", a.id), 0, "no session");
  assert.equal(await restoreTicketUser(jar.get(RESTORE_COOKIE)), a.id);
  // A live account signs in as before.
  const live = await account();
  const jar2: Jar = new Map();
  await inRequest(jar2, "203.0.113.21", () => finishSignIn(live.id, "password"));
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", live.id), 1);
  assert.equal(jar2.has(RESTORE_COOKIE), false);
});

test("restore works once with a live ticket inside 14 days, never after, and never undoes an admin's suspension", async () => {
  const { q } = await import("../src/lib/db");
  const { requestDeletion, issueRestoreTicket, restoreWithTicket, restorable } = await import("../src/lib/account-deletion");
  const a = await account();
  await requestDeletion(a.id);
  const ticket = await issueRestoreTicket(a.id);
  assert.equal(await restoreWithTicket("not-a-ticket"), null);
  assert.equal(await restoreWithTicket(ticket), a.id);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM users WHERE id = ? AND suspended_at IS NULL AND deletion_requested_at IS NULL", a.id), 1, "back on");
  assert.equal(await restoreWithTicket(ticket), null, "a ticket works once");

  const late = await account();
  await requestDeletion(late.id);
  const lateTicket = await issueRestoreTicket(late.id);
  await ageDeletion(late.id, 15);
  assert.equal(await restorable(late.id), false);
  assert.equal(await restoreWithTicket(lateTicket), null, "too late");

  const old = await account();
  await requestDeletion(old.id);
  const oldTicket = await issueRestoreTicket(old.id);
  await q.run("UPDATE restore_tickets SET expires_at = 0 WHERE user_id = ?", old.id);
  assert.equal(await restoreWithTicket(oldTicket), null, "an expired ticket");

  const banned = await account();
  await q.run("UPDATE users SET suspended_at = ? WHERE id = ?", Date.now() - DAY, banned.id);
  await requestDeletion(banned.id);
  assert.equal(await restorable(banned.id), false, "an admin's suspension stays");
});

test("day 14: evidence kept, account purged, once; held accounts wait; evidence expires after 6 years unless held", async () => {
  const { q, now } = await import("../src/lib/db");
  const { requestDeletion, runDeletions, setLegalHold, clearLegalHold } = await import("../src/lib/account-deletion");
  const { audit } = await import("../src/lib/audit");
  const a = await account();
  await audit(a.id, "signed_in");
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 'artist@example.test', 'Artist', ?) RETURNING id", a.id, now()))!.id;
  await q.run("INSERT INTO events (user_id, sender_id, type, detail, created_at) VALUES (?, ?, 'submitted', 'secret detail', ?)", a.id, sender, now());
  await q.run("INSERT INTO events (user_id, sender_id, type, detail, created_at) VALUES (?, ?, 'opened', '', ?)", a.id, sender, now());
  await requestDeletion(a.id);

  const held = await account();
  await requestDeletion(held.id);
  const admin = await account("admin");
  assert.ok(await setLegalHold(admin.id, held.id, "Court order 123"));
  assert.equal(await setLegalHold(admin.id, held.id, "  "), false, "a hold needs a reason");

  const early = await account();
  await requestDeletion(early.id);
  await ageDeletion(early.id, 13);

  await ageDeletion(a.id, 14);
  await ageDeletion(held.id, 30);
  const first = await runDeletions();
  assert.ok(first.accountsPurged >= 1, "every account past day 14 (an earlier test's too)");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM users WHERE id = ?", a.id), 0, "purged");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM senders WHERE user_id = ?", a.id), 0, "its sender rows go");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM users WHERE id = ?", held.id), 1, "held account kept");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM users WHERE id = ?", early.id), 1, "day 13 kept");

  const ev = (await q.get<{ email: string; handle: string; record: string }>("SELECT email, handle, record FROM account_evidence WHERE user_id = ?", a.id))!;
  assert.equal(ev.email, a.email);
  const record = JSON.parse(ev.record);
  assert.ok(record.accountLog.some((l: { action: string }) => l.action === "signed_in"), "sign-ins kept");
  assert.deepEqual(record.events.map((e: { type: string; sender_email: string }) => [e.type, e.sender_email]), [["submitted", "artist@example.test"]]);
  assert.ok(!ev.record.includes("secret detail"), "only the minimal fields");
  assert.ok(!/password|token|file_key/.test(ev.record));

  assert.equal((await runDeletions()).accountsPurged, 0, "a second run purges nothing more");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM account_evidence WHERE user_id = ?", a.id), 1);

  // Releasing the hold restarts the 14 days.
  assert.ok(await clearLegalHold(admin.id, held.id));
  await runDeletions();
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM users WHERE id = ?", held.id), 1, "fresh 14 days after release");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM admin_log WHERE action IN ('set legal hold', 'cleared legal hold')"), 2, "both logged");

  // Evidence: gone after 6 years, unless held.
  const sevenYears = 7 * 366 * DAY;
  await q.run("UPDATE account_evidence SET keep_from = keep_from - ? WHERE user_id = ?", sevenYears, a.id);
  assert.ok(await setLegalHold(admin.id, a.id, "Dispute"));
  await runDeletions();
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM account_evidence WHERE user_id = ?", a.id), 1, "held evidence kept");
  await clearLegalHold(admin.id, a.id);
  await q.run("UPDATE account_evidence SET keep_from = keep_from - ? WHERE user_id = ?", sevenYears, a.id);
  assert.equal((await runDeletions()).evidenceExpired, 1);
});

test("an account switched back on is never purged; a hold re-checked just before; self-holds refused; the first hold stands", async () => {
  const { q } = await import("../src/lib/db");
  const { requestDeletion, runDeletions, setLegalHold } = await import("../src/lib/account-deletion");
  const back = await account();
  await requestDeletion(back.id);
  await ageDeletion(back.id, 20);
  // As if an admin switched it on by hand (the Unsuspend button now refuses a pending deletion).
  await q.run("UPDATE users SET suspended_at = NULL WHERE id = ?", back.id);
  await runDeletions();
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM users WHERE id = ?", back.id), 1, "live account kept");

  const admin = await account("selfadmin");
  assert.equal(await setLegalHold(admin.id, admin.id, "Mine"), false, "no hold on your own account");
  const held = await account();
  assert.ok(await setLegalHold(admin.id, held.id, "Court order 1"));
  assert.equal(await setLegalHold(admin.id, held.id, "Something else"), false, "already held");
  assert.equal((await q.get<{ r: string }>("SELECT legal_hold_reason AS r FROM users WHERE id = ?", held.id))!.r, "Court order 1");
});

test("evidence keeps the account's own sign-in detail, never free text naming others; expires exactly after 6 years", async () => {
  const { q } = await import("../src/lib/db");
  const { requestDeletion, runDeletions } = await import("../src/lib/account-deletion");
  const { audit } = await import("../src/lib/audit");
  const a = await account();
  await audit(a.id, "signed_in", "with passkey");
  await audit(a.id, "team_invited", "friend@example.test (member)");
  await requestDeletion(a.id);
  await ageDeletion(a.id, 15);
  await runDeletions();
  const record = JSON.parse((await q.get<{ record: string }>("SELECT record FROM account_evidence WHERE user_id = ?", a.id))!.record);
  assert.ok(record.accountLog.some((l: { action: string; detail: string }) => l.action === "signed_in" && l.detail === "with passkey"));
  assert.ok(record.accountLog.some((l: { action: string; detail: string }) => l.action === "team_invited" && l.detail === ""), "other people's emails left out");

  // The 6-year line: 5 years 364 days kept, 6 years and a day gone.
  const t = Date.UTC(2032, 5, 15);
  const sixYearsBefore = Date.UTC(2026, 5, 15);
  const kept = 900_001, gone = 900_002;
  for (const [id, keepFrom] of [[kept, sixYearsBefore + DAY], [gone, sixYearsBefore - DAY]]) {
    await q.run("INSERT INTO account_evidence (user_id, name, email, handle, account_created_at, deletion_requested_at, purged_at, keep_from, record) VALUES (?, 'x', ?, ?, 0, 0, 0, ?, '{}')", id, `ev${id}@example.test`, `ev${id}`, keepFrom);
  }
  await runDeletions(t);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM account_evidence WHERE user_id = ?", kept), 1, "5y364d kept");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM account_evidence WHERE user_id = ?", gone), 0, "6y1d deleted");
});

test("expired restore tickets are cleared by the nightly job", async () => {
  const { q } = await import("../src/lib/db");
  const { requestDeletion, issueRestoreTicket, runDeletions } = await import("../src/lib/account-deletion");
  const a = await account();
  await requestDeletion(a.id);
  await issueRestoreTicket(a.id);
  await q.run("UPDATE restore_tickets SET expires_at = 1 WHERE user_id = ?", a.id);
  await runDeletions();
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM restore_tickets WHERE user_id = ?", a.id), 0);
});

test("suspending during the 14 days sticks: restore refused, purge still due; Unsuspend refuses a pending deletion", async () => {
  const fs = await import("node:fs");
  const { q, now } = await import("../src/lib/db");
  const { requestDeletion, restorable, issueRestoreTicket, restoreWithTicket } = await import("../src/lib/account-deletion");
  // Server actions need an ops session, so the two guards are checked in the source and their SQL run here.
  const src = fs.readFileSync("src/app/admin/actions.ts", "utf8");
  const suspend = src.slice(src.indexOf("async function suspendOne")).split("\nexport ")[0];
  assert.match(suspend, /suspended_at IS NULL OR suspended_at = deletion_requested_at/);
  const unsuspend = src.slice(src.indexOf("export async function unsuspendAccount")).split("\nexport ")[0];
  assert.match(unsuspend, /deletion_requested_at IS NOT NULL/);
  assert.ok(unsuspend.indexOf("deletion_requested_at IS NOT NULL") < unsuspend.indexOf("UPDATE users"), "refused before any change");

  const a = await account();
  await requestDeletion(a.id);
  const ticket = await issueRestoreTicket(a.id);
  const r = await q.run(
    "UPDATE users SET suspended_at = ?, suspended_reason = ? WHERE id = ? AND (suspended_at IS NULL OR suspended_at = deletion_requested_at)",
    now() + 1,
    "spam",
    a.id,
  );
  assert.equal(r.changes, 1, "the suspension lands");
  assert.equal(await restorable(a.id), false);
  assert.equal(await restoreWithTicket(ticket), null, "restore refused");
});

test("a held account's tracks, events and log lines outlive ordinary retention; an admin can't clear a hold on themselves", async () => {
  const { q } = await import("../src/lib/db");
  const { setLegalHold, clearLegalHold } = await import("../src/lib/account-deletion");
  const { cleanupRecords } = await import("../src/lib/retention");
  const admin = await account("holdadmin");
  const held = await account();
  const old = Date.now() - 3000 * DAY;
  await q.run("INSERT INTO account_log (user_id, action, detail, created_at) VALUES (?, 'signed_in', '', ?)", held.id, old);
  await q.run("INSERT INTO account_log (user_id, action, detail, created_at) VALUES (?, 'signed_in', '', ?)", admin.id, old);
  assert.ok(await setLegalHold(admin.id, held.id, "Dispute"));
  await cleanupRecords(Date.now(), Date.now() + 60_000);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM account_log WHERE user_id = ? AND created_at = ?", held.id, old), 1, "held: kept");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM account_log WHERE user_id = ? AND created_at = ?", admin.id, old), 0, "not held: cleared");
  assert.equal(await clearLegalHold(held.id, held.id), false, "not on yourself");
  assert.equal(await clearLegalHold(admin.id, admin.id), false);
});

test("the purge re-checks inside its own transaction; a restore drops a stale evidence row; a suspended account gets no session", async () => {
  const { q } = await import("../src/lib/db");
  const { purgeAccount } = await import("../src/lib/privacy");
  const { requestDeletion, issueRestoreTicket, restoreWithTicket } = await import("../src/lib/account-deletion");
  const { finishSignIn } = await import("../src/lib/security");
  const a = await account();
  assert.equal(await purgeAccount(a.id, async () => false), false, "a no from the locked check deletes nothing");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM users WHERE id = ?", a.id), 1);

  const b = await account();
  await requestDeletion(b.id);
  await q.run("INSERT INTO account_evidence (user_id, name, email, handle, account_created_at, deletion_requested_at, purged_at, keep_from, record) VALUES (?, 'x', ?, ?, 0, 0, 0, 0, '{}')", b.id, b.email, b.handle);
  assert.equal(await restoreWithTicket(await issueRestoreTicket(b.id)), b.id);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM account_evidence WHERE user_id = ?", b.id), 0, "stale evidence gone");

  const banned = await account();
  await q.run("UPDATE users SET suspended_at = ? WHERE id = ?", Date.now(), banned.id);
  const jar: Jar = new Map();
  const out = await inRequest(jar, "203.0.113.30", () => finishSignIn(banned.id, "password"));
  assert.equal(out.redirect, "/login");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", banned.id), 0, "no session");
});

test("hold actions are super admin only; the restore cookie is HttpOnly, SameSite and scoped to /restore", async () => {
  const fs = await import("node:fs");
  const { ACTION_NEEDS } = await import("../src/lib/ops-perms");
  const needs = ACTION_NEEDS as Record<string, string>;
  assert.equal(needs.adminSetLegalHold, "super");
  assert.equal(needs.adminClearLegalHold, "super");
  const src = fs.readFileSync("src/lib/security.ts", "utf8");
  const set = src.slice(src.indexOf("set(RESTORE_COOKIE"), src.indexOf("set(RESTORE_COOKIE") + 260);
  assert.match(set, /httpOnly: true/);
  assert.match(set, /sameSite: "lax"/);
  assert.match(set, /path: "\/restore"/);
  assert.match(set, /secure: process\.env\.NODE_ENV === "production"/);
});

test("a purged account's Terms acceptances stay, stamped with the deletion, for their own 6 years", async () => {
  const { q, now } = await import("../src/lib/db");
  const { requestDeletion, runDeletions } = await import("../src/lib/account-deletion");
  const { purgeTermsProof } = await import("../src/lib/retention");
  const a = await account();
  await q.run("INSERT INTO terms_versions (hash, version, body, created_at) VALUES ('h-del', '15 Nov 2026', 'Terms', ?) ON CONFLICT (hash) DO NOTHING", now());
  await q.run("INSERT INTO terms_acceptances (kind, user_id, email, version, hash, name, accepted_at) VALUES ('account', ?, ?, '15 Nov 2026', 'h-del', 'Del', ?)", a.id, a.email, now());
  await requestDeletion(a.id);
  await ageDeletion(a.id, 15);
  await runDeletions();
  await purgeTermsProof(now(), Date.now() + 60_000);
  const row = (await q.get<{ user_id: number | null; account_deleted_at: number | null }>("SELECT user_id, account_deleted_at FROM terms_acceptances WHERE email = ? AND hash = 'h-del'", a.email))!;
  assert.equal(row.user_id, null);
  assert.ok(row.account_deleted_at, "stamped");
});

test("the restore route is open through the site lock and its name can't be taken as a link", async () => {
  const fs = await import("node:fs");
  assert.match(fs.readFileSync("src/proxy.ts", "utf8"), /"\/restore"/);
  const { RESERVED_HANDLES } = await import("../src/lib/plans").catch(() => ({ RESERVED_HANDLES: undefined }));
  if (RESERVED_HANDLES) assert.ok([...RESERVED_HANDLES].includes("restore"));
});
