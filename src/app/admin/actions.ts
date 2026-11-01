"use server";

import { runBackup } from "@/lib/backup";
import { AUDIT_BUCKETS, checkBucket } from "@/lib/storage-audit";
import { setExtraSeats } from "@/lib/account-members";
import { reopenCallouts } from "@/lib/desk";
import crypto from "node:crypto";
import { newsletterFooter } from "@/lib/newsletter";
import { EMAILS, emailKey, emailTemplate, emailText, fillEmail, SAMPLE_VARS, type EmailId } from "@/lib/email-copy";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { FEATURES, type Feature } from "@/lib/features";
import { allPlans, FREE_PLAN } from "@/lib/plan-store";
import { audienceWhere, cleanTags, describeAudience, readAudience } from "@/lib/audience";
import { bulkIds } from "@/lib/admin-bulk";
import { SITE_PAGES, type SitePage } from "@/lib/content";
import { writeContent } from "@/lib/content-write";
import { redirect } from "next/navigation";
import { issueViewTicket } from "@/lib/ops";
import { APP_URL } from "@/lib/mail";
import { env } from "@/lib/env";
import { HIDDEN, sendMail } from "@/lib/mail";
import { isAdminEmail, logAdmin, requireAdminAction } from "@/lib/admin";
import { opsAccessFor, suspendRefusal } from "@/lib/ops-access";
import { PERMS, ROLE_PERMS, ROLES, type Perm, type Role } from "@/lib/ops-perms";
import { grantablePlan, type PlanRequest } from "@/lib/plan-requests";
import { flash } from "@/lib/flash";
import { isTargeted, setSwitch, setSwitchRule, SWITCHES, type SwitchKey } from "@/lib/switches";
import { clampPercent, describeRule, parseCountries, readRule, MAX_RULE_ACCOUNTS } from "@/lib/switch-rules";
import { ACCOUNT_TYPES, isAccountType } from "@/lib/account-types";
import { drainNow, retireTrackFiles } from "@/lib/deletion";
import { cancelEmailChange, changeHandle, HANDLE_HOLD_DAYS, requestEmailChange } from "@/lib/accounts";
import { logEvent, now, q, type Track } from "@/lib/db";
import { eraseSender, purgeAccount } from "@/lib/privacy";
import { localPath } from "@/lib/safe-links";
import { normalEmail } from "@/lib/email-normal";
import { deleteRevokedInvite, GATE_CODE_MIN_LENGTH, restoreRevokedInvite } from "@/lib/invites";

const refresh = () => revalidatePath("/admin", "layout");
const done = (m: string) => flash(m);
const fail = async (m: string) => {
  await flash(m, "error");
  refresh();
};
const target = async (id: number) => q.get<{ id: number; email: string; handle: string }>("SELECT id, email, handle FROM users WHERE id = ?", id);

export async function suspendAccount(userId: number, reason: string) {
  const a = await requireAdminAction("users.support");
  const r = await suspendOne(a, userId, reason);
  if (!r.ok) return fail(r.why);
  await done(`Suspended @${r.handle} and emailed them`);
  refresh();
}

/** Users → select rows → Suspend…: the same as suspending each one, at most BULK_MAX at a time, with one reason. */
export async function suspendAccounts(form: FormData) {
  const a = await requireAdminAction("users.support");
  const ids = readIds(form);
  const reason = String(form.get("reason") || "").trim();
  if (!ids.length) return fail("Pick at least one account");
  if (!reason) return fail("Give a reason: it goes in the email and the log");
  const results = [];
  for (const id of ids) results.push(await suspendOne(a, id, reason));
  const ok = results.filter((r) => r.ok).length;
  const skipped = results.length - ok;
  await logAdmin(a.id, "bulk suspended", `${ok} account${ok === 1 ? "" : "s"}`, reason);
  await (ok ? done : fail)(`Suspended ${ok} account${ok === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} (already suspended, yours, or not allowed)` : ""}`);
  refresh();
}

/** Users → select rows → Add tag: adds one tag to each selected account, keeping the tags they have. */
export async function tagAccounts(form: FormData) {
  const a = await requireAdminAction("users.support");
  const ids = readIds(form);
  const tag = cleanTags(String(form.get("tag") || "")).split(",")[0];
  if (!ids.length || !tag) return fail("Pick accounts and type a tag");
  const rows = await q.all<{ id: number; admin_tags: string }>(`SELECT id, admin_tags FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  for (const r of rows) await q.run("UPDATE users SET admin_tags = ? WHERE id = ?", cleanTags(`${r.admin_tags},${tag}`), r.id);
  await logAdmin(a.id, "tagged accounts", `${rows.length} account${rows.length === 1 ? "" : "s"}`, tag);
  await done(`Tagged ${rows.length} account${rows.length === 1 ? "" : "s"} ${tag}`);
  refresh();
}

/** Suspends one account for an admin: the rules, the database change, the log and the email. */
async function suspendOne(a: Awaited<ReturnType<typeof requireAdminAction>>, userId: number, reason: string): Promise<{ ok: true; handle: string } | { ok: false; why: string }> {
  const u = await target(userId);
  if (!u || u.id === a.id) return { ok: false, why: "Couldn't suspend: account not found, or it's yours" };
  const refused = suspendRefusal(a.access, await opsAccessFor(u));
  if (refused) return { ok: false, why: refused };
  const why = String(reason || "").trim().slice(0, 200);
  const r = await q.tx(async (db) => {
    const r = await db.run("UPDATE users SET suspended_at = ?, suspended_reason = ? WHERE id = ? AND suspended_at IS NULL", now(), why, u.id);
    if (!r.changes) return r;
    await db.run("DELETE FROM sessions WHERE user_id = ?", u.id);
    await db.run("INSERT INTO account_actions (user_id, kind, reason, admin_id, created_at) VALUES (?,?,?,?,?)", u.id, "suspended", why, a.id, now());
    await db.run("INSERT INTO admin_log (admin_id, action, target, detail, created_at) VALUES (?,?,?,?,?)", a.id, "suspended", `@${u.handle}`, why, now());
    return r;
  });
  if (!r.changes) return { ok: false, why: "Already suspended" };
  await sendMail({
    userId: u.id,
    audience: "support",
    to: u.email,
    subject: "Your FloorTest account is suspended",
    body: [
      "Hi,",
      "",
      "We've suspended your FloorTest account. While it's suspended you can't sign in, and your link is offline. Nothing has been deleted.",
      "",
      `Reason: ${why || "a breach of our Terms"}`,
      "",
      `If you think this is a mistake, you can appeal here and a person will review it: ${env.appUrl}/contact?appeal=1`,
      "",
      "— FloorTest",
    ].join("\n"),
  }).catch(() => {});
  return { ok: true, handle: u.handle };
}

/** Account ids picked on the Users list: whole numbers only, no repeats, at most BULK_MAX. */
const readIds = (form: FormData) => bulkIds(form.getAll("ids").map(String));

export async function unsuspendAccount(userId: number) {
  const a = await requireAdminAction("users.support");
  const u = await target(userId);
  if (!u) return fail("Account not found");
  const r = await q.tx(async (db) => {
    const r = await db.run("UPDATE users SET suspended_at = NULL, suspended_reason = '' WHERE id = ? AND suspended_at IS NOT NULL", u.id);
    if (!r.changes) return r;
    await db.run("INSERT INTO account_actions (user_id, kind, admin_id, created_at) VALUES (?,?,?,?)", u.id, "unsuspended", a.id, now());
    await db.run("INSERT INTO admin_log (admin_id, action, target, detail, created_at) VALUES (?,?,?,?,?)", a.id, "unsuspended", `@${u.handle}`, "", now());
    return r;
  });
  if (!r.changes) return fail("Not suspended");
  await sendMail({
    userId: u.id,
    audience: "support",
    to: u.email,
    subject: "Your FloorTest account is back",
    body: ["Hi,", "", `Your account is restored. You can sign in again, and your link is back online: ${env.appUrl}/login`, "", "FloorTest"].join("\n"),
  }).catch(() => {});
  await done(`Restored @${u.handle} and emailed them`);
  refresh();
}

export async function signOutEverywhere(userId: number) {
  const a = await requireAdminAction("super");
  const u = await target(userId);
  if (!u) return fail("Account not found");
  const r = await q.run("DELETE FROM sessions WHERE user_id = ?", u.id);
  await logAdmin(a.id, "signed out everywhere", `@${u.handle}`, `${r.changes} sessions`);
  await done(`Signed @${u.handle} out of ${r.changes} session${r.changes === 1 ? "" : "s"}`);
  refresh();
}

/** For a receiver locked out of their authenticator app after confirming who they are. */
export async function resetTwoFactor(userId: number, form: FormData) {
  const a = await requireAdminAction("super");
  const u = await target(userId);
  if (!u || u.id === a.id) return fail("You can't reset your own two-factor here");
  // Step-up: type their handle and how you confirmed it's them.
  const how = String(form.get("how") || "").trim().slice(0, 200);
  if (String(form.get("handle") || "").trim().replace(/^@/, "").toLowerCase() !== u.handle.toLowerCase() || how.length < 5) return fail("Nothing changed: the handle didn't match, or the note is too short");
  await q.run("UPDATE users SET totp_enabled_at = NULL, totp_secret = NULL, totp_last_step = NULL, recovery_codes = '[]' WHERE id = ?", u.id);
  await q.run("DELETE FROM sessions WHERE user_id = ?", u.id);
  await logAdmin(a.id, "reset two-factor", `@${u.handle}`, how);
  await done(`Two-factor reset for @${u.handle}; they're signed out`);
  refresh();
}

export async function setPlanFor(userId: number, plan: string) {
  const a = await requireAdminAction("super");
  const u = await target(userId);
  if (!u || !["free", "pro", "team"].includes(plan)) return fail("Couldn't change the plan");
  await q.run("UPDATE users SET plan = ? WHERE id = ?", plan, u.id);
  await logAdmin(a.id, "changed plan", `@${u.handle}`, plan);
  await done(`@${u.handle} is now on ${plan}`);
  refresh();
}

/** Add-on seats for an account team (sold separately while card payments aren't live). */
export async function setExtraSeatsFor(userId: number, form: FormData) {
  const a = await requireAdminAction("super");
  const u = await target(userId);
  const n = Math.floor(Number(form.get("extra_seats")));
  if (!u || !Number.isFinite(n) || n < 0 || n > 500) return fail("Extra seats must be between 0 and 500.");
  await setExtraSeats(u.id, n);
  await logAdmin(a.id, "set extra seats", `@${u.handle}`, String(n));
  await done(`@${u.handle} now has ${n} extra seat${n === 1 ? "" : "s"}`);
  refresh();
}

/** Storage move: a fresh database backup now (its own file; the nightly backups are untouched; nothing is deleted). */
export async function backupNow() {
  const a = await requireAdminAction("storage");
  try {
    const r = await runBackup();
    await logAdmin(a.id, "backed up the database", "", JSON.stringify(r));
    await done("Database backed up.");
  } catch (e) {
    await logAdmin(a.id, "backup failed", "", e instanceof Error ? e.message : String(e));
    return fail("The backup failed. Nothing was changed; see Incidents.");
  }
  refresh();
}

/** Storage move: confirm every file the database expects is in `bucket`, at the right size. Read-only; logged. */
export async function checkStorage(form: FormData) {
  const a = await requireAdminAction("storage");
  const bucket = String(form.get("bucket") || "");
  if (!AUDIT_BUCKETS.includes(bucket)) return fail("Choose a bucket from the list.");
  let r;
  try {
    r = await checkBucket(bucket);
  } catch (e) {
    await logAdmin(a.id, "checked storage", bucket, `failed: ${(e as Error).message}`);
    return fail(`${(e as Error).message}. Nothing was counted as missing; check the app's storage key can read this bucket.`);
  }
  await logAdmin(a.id, "checked storage", bucket, `${r.present}/${r.expected} present, ${r.missing.length} missing, ${r.wrongSize.length} wrong size${r.finished ? "" : ", stopped early (time)"}`);
  await done(r.missing.length || r.wrongSize.length ? `${bucket}: ${r.missing.length} missing, ${r.wrongSize.length} wrong size.` : r.finished ? `${bucket}: all ${r.expected} files present.` : `${bucket}: checked ${r.checked} of ${r.expected} before time ran out; run it again.`);
  refresh();
}

export async function createInvite(form: FormData) {
  const a = await requireAdminAction("invites");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const typed = String(form.get("code") || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
  const code = typed || `FLOOR-${Array.from(crypto.randomBytes(5), (b) => alphabet[b % alphabet.length]).join("")}`;
  const max = Math.min(10_000, Math.max(1, Math.round(Number(form.get("max_uses")) || 25)));
  const note = String(form.get("note") || "").trim().slice(0, 120);
  const r = await q.run("INSERT INTO invites (code, max_uses, note, created_at) VALUES (?,?,?,?) ON CONFLICT (code) DO NOTHING", code, max, note, now());
  if (!r.changes) return fail(`An invite called ${code} already exists. Pick another code.`);
  await logAdmin(a.id, "created invite", code, `${max} uses${note ? ` · ${note}` : ""}`);
  await done(`Invite ${code} created`);
  refresh();
}

export async function revokeInvite(code: string) {
  const a = await requireAdminAction("invites");
  await q.run("UPDATE invites SET revoked_at = ? WHERE code = ? AND revoked_at IS NULL", now(), code);
  await logAdmin(a.id, "revoked invite", code);
  await done(`Revoked ${code}`);
  refresh();
}

/** Revoked list → Restore: the invite works again (refused if its email has an account or another live invite). */
export async function restoreInvite(code: string) {
  const a = await requireAdminAction("invites");
  const r = await restoreRevokedInvite(code);
  if (!r.ok) return fail(r.reason);
  await logAdmin(a.id, "restored invite", r.email ?? r.code, r.code);
  await done(`Restored ${r.code}${r.email ? ` for ${r.email}` : ""}`);
  refresh();
}

/** Revoked list → Delete for good: the invite and its invite emails go; Ops log lines that mention it stay. */
export async function deleteInvite(code: string) {
  const a = await requireAdminAction("invites");
  const r = await deleteRevokedInvite(code);
  if (!r.ok) return fail(r.reason);
  const logged = await q.count("SELECT COUNT(*) AS n FROM admin_log WHERE strpos(target, ?) > 0 OR strpos(detail, ?) > 0", r.code, r.code);
  await logAdmin(a.id, "deleted invite", r.email ?? r.code, `${r.code} · ${r.emails} email${r.emails === 1 ? "" : "s"} removed`);
  await done(`Deleted ${r.code}${r.email ? ` for ${r.email}` : ""} and ${r.emails} invite email${r.emails === 1 ? "" : "s"}. ${logged} Ops log line${logged === 1 ? "" : "s"} still mention it.`);
  refresh();
}

/** Takes down an abusive upload: file gone from storage, track gone from the receiver's desk. */
export async function removeTrackAsAdmin(trackId: number, reason: string) {
  const a = await requireAdminAction("moderation");
  const t = await q.get<Track & { handle: string }>(
    "SELECT t.*, u.handle FROM tracks t JOIN users u ON u.id = t.user_id WHERE t.id = ? AND t.deleted_at IS NULL",
    trackId,
  );
  if (!t) return fail("That track is already gone");
  await q.tx(async (db) => {
    await retireTrackFiles(db, [t.id], "removed by admin");
    await db.run("UPDATE tracks SET deleted_at = ?, file_key = NULL, art_key = NULL WHERE id = ?", now(), t.id);
    await reopenCallouts(db);
  });
  await drainNow();
  await logEvent({ user_id: t.user_id, sender_id: t.sender_id, track_id: t.id, type: "deleted", detail: "removed by FloorTest" });
  await logAdmin(a.id, "removed track", `${t.artist} – ${t.title}`, `from @${t.handle}${reason ? ` · ${reason}` : ""}`);
  await done(`Removed "${t.title}" and its file`);
  refresh();
}

/** Blocks a sender email on one receiver's link (the same as the receiver blocking them). */
export async function blockSenderAsAdmin(senderId: number) {
  const a = await requireAdminAction("moderation");
  const s = await q.get<{ id: number; email: string; user_id: number }>("SELECT id, email, user_id FROM senders WHERE id = ?", senderId);
  if (!s) return fail("Sender not found");
  await q.run("UPDATE senders SET blocked_at = COALESCE(blocked_at, ?) WHERE id = ?", now(), s.id);
  await logAdmin(a.id, "blocked sender", s.email);
  await done(`Blocked ${s.email} on that link`);
  refresh();
}

/** Read-only look at someone's desk, for support. 30 minutes, logged. */
export async function startViewAs(userId: number) {
  const a = await requireAdminAction("super");
  const u = await target(userId);
  if (!u || u.id === a.id) return;
  // The desk lives on the main site; a single-use, 60-second ticket carries the admin across.
  const ticket = await issueViewTicket(a.id, u.id);
  await logAdmin(a.id, "viewed desk", `@${u.handle}`, "read-only, 30 min");
  redirect(`${APP_URL}/dashboard/view-as?t=${encodeURIComponent(ticket)}`);
}

/** Sends a logged email again, to the same address. */
export async function resendEmail(outboxId: number) {
  const a = await requireAdminAction("emails.act");
  const m = await q.get<{ user_id: number | null; to_email: string; subject: string; body: string; audience: "sender" | "receiver" | "support" }>(
    "SELECT user_id, to_email, subject, body, audience FROM outbox WHERE id = ?",
    outboxId,
  );
  if (!m) return fail("Email not found");
  // A sign-in code or private link was hidden in the stored copy: resending it would send the placeholder.
  if (m.subject.includes(HIDDEN) || m.body.includes(HIDDEN)) return fail("This email held a sign-in code or private link, so it can't be resent. Ask them to request a new one.");
  const status = await sendMail({ userId: m.user_id, to: m.to_email, subject: m.subject, body: m.body, audience: m.audience });
  await logAdmin(a.id, "resent email", m.subject, status);
  await done(status.startsWith("failed") ? `Resend failed: ${status}` : `Resent to ${m.to_email}`);
  refresh();
}

export async function setContactHandled(id: number, handled: boolean) {
  const a = await requireAdminAction("inbox.act");
  await q.run("UPDATE contact_messages SET handled_at = ? WHERE id = ?", handled ? now() : null, id);
  await logAdmin(a.id, handled ? "handled message" : "reopened message", `#${id}`);
  await done(handled ? "Marked handled" : "Reopened");
  refresh();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const newCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // 10 characters from 32 (50 bits): the code is what proves the email while sign-up is closed.
  return `FLOOR-${Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join("")}`;
};

async function mailInvite(code: string, email: string, inviter: string, note: string, handle = "") {
  const link = `${env.appUrl}/signup?invite=${encodeURIComponent(code)}${handle ? `&handle=${encodeURIComponent(handle)}` : ""}`;
  return sendMail({
    userId: null,
    audience: "support",
    to: email,
    ...(await emailText("invite", { inviter, personal_note: note ? `\n"${note}"\n` : "", signup_url: link, code, email })),
  });
}

/** Sends a personal, single-use invite to each address. Skips existing accounts and pending invites. */
export async function inviteByEmail(form: FormData) {
  const a = await requireAdminAction("invites");
  const note = String(form.get("note") || "").trim().slice(0, 300);
  const emails = [...new Set(String(form.get("emails") || "").split(/[\s,;]+/).map(normalEmail).filter(Boolean))].slice(0, 50);
  let sent = 0;
  let skipped = 0;
  for (const email of emails) {
    const taken =
      !EMAIL_RE.test(email) ||
      (await q.get("SELECT 1 FROM users WHERE email = ?", email)) ||
      (await q.get("SELECT 1 FROM invites WHERE email = ? AND revoked_at IS NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.invite_code = invites.code)", email));
    if (taken) {
      skipped++;
      continue;
    }
    const code = newCode();
    await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES (?,?,?,?,?)", code, 1, note, email, now());
    if (!(await mailInvite(code, email, a.name, note)).startsWith("failed")) await q.run("UPDATE invites SET sent_at = ? WHERE code = ?", now(), code);
    await logAdmin(a.id, "invited by email", email, code);
    sent++;
  }
  refresh();
  redirect(`/admin/invites?sent=${sent}&skipped=${skipped}`);
}

export async function resendInvite(code: string) {
  const a = await requireAdminAction("invites");
  const inv = await q.get<{ email: string | null; note: string }>("SELECT email, note FROM invites WHERE code = ? AND revoked_at IS NULL", code);
  if (!inv?.email) return fail("Couldn't resend: the invite is revoked or has no email");
  // An old short code can't open the coming-soon gate (src/lib/invites.ts): resending swaps in a new long one.
  const send = code.length < GATE_CODE_MIN_LENGTH ? newCode() : code;
  if (send !== code) {
    await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) SELECT ?, max_uses, note, email, ? FROM invites WHERE code = ?", send, now(), code);
    await q.run("UPDATE invites SET revoked_at = ? WHERE code = ?", now(), code);
  }
  if ((await mailInvite(send, inv.email, a.name, inv.note)).startsWith("failed")) return fail("The email failed to send. Check the Email log, then try again.");
  await q.run("UPDATE invites SET sent_at = ? WHERE code = ?", now(), send);
  await logAdmin(a.id, "resent invite", inv.email, send);
  await done(`Invite resent to ${inv.email}`);
  refresh();
}

/** Waitlist → personal invite in one click. */
/** One waitlist invite: "sent", "joined" (already has an account), "invited" (already done), or "failed" (email didn't send). */
async function sendWaitlistInvite(id: number, a: { id: number; name: string }) {
  const w = await q.get<{ email: string; invited_at: number | null; handle: string }>("SELECT email, invited_at, handle FROM waitlist WHERE id = ?", id);
  if (!w || w.invited_at) return "invited" as const;
  if (await q.get("SELECT 1 FROM users WHERE email = ?", w.email)) {
    await q.run("UPDATE waitlist SET invited_at = ? WHERE id = ?", now(), id);
    return "joined" as const;
  }
  const code = newCode();
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES (?,?,?,?,?)", code, 1, "From the waitlist", w.email, now());
  if ((await mailInvite(code, w.email, a.name, "", w.handle)).startsWith("failed")) return "failed" as const;
  await q.run("UPDATE invites SET sent_at = ? WHERE code = ?", now(), code);
  await q.run("UPDATE waitlist SET invited_at = ? WHERE id = ?", now(), id);
  await logAdmin(a.id, "invited from waitlist", w.email, code);
  return "sent" as const;
}

export async function inviteFromWaitlist(id: number) {
  const a = await requireAdminAction("waitlist");
  const r = await sendWaitlistInvite(id, a);
  if (r === "invited") return fail("Already invited");
  if (r === "joined") return fail("They already have an account");
  if (r === "failed") return fail("The invite email failed to send. It's saved; resend it from Invites.");
  await done("Invite sent");
  refresh();
}

/** Waitlist → "Invite the oldest N": first come, first served, one at a time so a failed email stops nothing else. */
export async function inviteOldestFromWaitlist(form: FormData) {
  const a = await requireAdminAction("waitlist");
  const n = Math.min(50, Math.max(1, Math.round(Number(form.get("n")) || 0)));
  const ids = await q.all<{ id: number }>("SELECT id FROM waitlist WHERE invited_at IS NULL ORDER BY created_at ASC LIMIT ?", n);
  const tally = { sent: 0, joined: 0, invited: 0, failed: 0 };
  for (const { id } of ids) tally[await sendWaitlistInvite(id, a)]++;
  const extra = [tally.joined && `${tally.joined} already had an account`, tally.failed && `${tally.failed} emails failed (resend from Invites)`].filter(Boolean).join(" · ");
  await (tally.failed ? fail : done)(`Invited ${tally.sent} from the waitlist${extra ? ` · ${extra}` : ""}`);
  refresh();
}

export async function removeFromWaitlist(id: number) {
  const a = await requireAdminAction("waitlist");
  const w = await q.get<{ email: string }>("DELETE FROM waitlist WHERE id = ? RETURNING email", id);
  if (w) await logAdmin(a.id, "removed from waitlist", w.email);
  await done(w ? `Removed ${w.email} from the waitlist` : "Already removed");
  refresh();
}

/* Identity verification and protected names */

export async function approveIdentity(userId: number) {
  const a = await requireAdminAction("verification");
  const u = await q.get<{ email: string; name: string; handle: string }>(
    "UPDATE users SET identity_status = 'verified', identity_verified_at = ?, identity_note = '' WHERE id = ? RETURNING email, name, handle",
    now(),
    userId,
  );
  if (!u) return fail("Account not found");
  await sendMail({
    userId,
    audience: "receiver",
    to: u.email,
    subject: "You're verified on FloorTest",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nYour FloorTest page now shows the Verified mark next to your name, so senders know it's really you: ${env.appUrl}/${u.handle}\n\nYou can remove the code from your bio now.\n\n— FloorTest`,
  });
  await logAdmin(a.id, "verified identity", `@${u.handle}`);
  await done(`Verified @${u.handle} and emailed them`);
  refresh();
}

/** Takes the Verified mark back (e.g. the account changed hands or was verified by mistake). A reason is required and sent to them. */
export async function revokeIdentity(userId: number, form: FormData) {
  const a = await requireAdminAction("verification");
  const note = String(form.get("note") || "").trim().slice(0, 200);
  if (!note) return fail("Give a reason; it's sent to them");
  const u = await q.get<{ email: string; name: string; handle: string }>(
    "UPDATE users SET identity_status = 'rejected', identity_verified_at = NULL, identity_note = ? WHERE id = ? AND identity_status = 'verified' RETURNING email, name, handle",
    note,
    userId,
  );
  if (!u) return fail("That account isn't verified");
  await sendMail({
    userId,
    audience: "receiver",
    to: u.email,
    subject: "Your FloorTest verification was removed",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nWe've removed the Verified mark from your FloorTest page: ${note}\n\nYou can apply again from Settings: ${env.appUrl}/dashboard/settings/profile#identity-h\n\nIf you think this is a mistake, reply to this email.\n\n— FloorTest`,
  });
  await logAdmin(a.id, "revoked verification", `@${u.handle}`, note);
  await done(`Removed @${u.handle}'s verification and emailed them`);
}

export async function rejectIdentity(userId: number, form: FormData) {
  const a = await requireAdminAction("verification");
  const note = String(form.get("note") || "").trim().slice(0, 200);
  const u = await q.get<{ email: string; name: string; handle: string }>(
    "UPDATE users SET identity_status = 'rejected', identity_note = ? WHERE id = ? RETURNING email, name, handle",
    note,
    userId,
  );
  if (!u) return fail("Account not found");
  await sendMail({
    userId,
    audience: "receiver",
    to: u.email,
    subject: "About your FloorTest verification",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nWe couldn't verify your profiles yet${note ? `: ${note}` : "."}\n\nYou can fix it and send it again from Settings: ${env.appUrl}/dashboard/settings/profile#identity-h\n\n— FloorTest`,
  });
  await logAdmin(a.id, "rejected identity", `@${u.handle}`, note);
  await done(`Rejected @${u.handle}'s verification and emailed them`);
  refresh();
}

export async function addProtectedName(form: FormData) {
  const a = await requireAdminAction("verification");
  const { normalizeName } = await import("@/lib/identity");
  const names = String(form.get("names") || "")
    .split(/[\n,;]+/)
    .map((n) => normalizeName(n))
    .filter((n) => n.length >= 3)
    .slice(0, 100);
  const note = String(form.get("note") || "").trim().slice(0, 120);
  for (const n of names) await q.run("INSERT INTO protected_names (handle, note, created_at) VALUES (?,?,?) ON CONFLICT (handle) DO NOTHING", n, note, now());
  if (names.length) await logAdmin(a.id, "protected names", names.join(", ").slice(0, 200), note);
  await done(names.length ? `Protected ${names.length} name${names.length === 1 ? "" : "s"}` : "No names of 3+ characters to add");
  refresh();
}

export async function removeProtectedName(handle: string) {
  const a = await requireAdminAction("verification");
  await q.run("DELETE FROM protected_names WHERE handle = ?", handle);
  await logAdmin(a.id, "unprotected name", handle);
  await done(`Unprotected ${handle}`);
  refresh();
}

const cleanBlock = (raw: string) => {
  const v = raw.trim().toLowerCase().replace(/^@/, "");
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { kind: "email" as const, value: v };
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) return { kind: "domain" as const, value: v };
  return null;
};

/** Stops an address, or a whole domain, sending to anyone on FloorTest. */
export async function addPlatformBlock(form: FormData) {
  const a = await requireAdminAction("blocks");
  const b = cleanBlock(String(form.get("value") || ""));
  if (!b) return fail("Enter an email address or a domain like example.com");
  const reason = String(form.get("reason") || "").trim().slice(0, 200);
  await q.run("INSERT INTO platform_blocks (kind, value, reason, admin_id, created_at) VALUES (?,?,?,?,?) ON CONFLICT (value) DO NOTHING", b.kind, b.value, reason, a.id, now());
  await logAdmin(a.id, `blocked ${b.kind} everywhere`, b.value, reason);
  await done(`Blocked ${b.value} everywhere`);
  refresh();
}

export async function blockEverywhere(email: string) {
  await requireAdminAction("blocks");
  const f = new FormData();
  f.set("value", email);
  f.set("reason", "from moderation");
  await addPlatformBlock(f);
}

export async function removePlatformBlock(id: number) {
  const a = await requireAdminAction("blocks");
  const b = await q.get<{ value: string }>("SELECT value FROM platform_blocks WHERE id = ?", id);
  if (!b) return fail("Already lifted");
  await q.run("DELETE FROM platform_blocks WHERE id = ?", id);
  await logAdmin(a.id, "lifted platform block", b.value);
  await done(`${b.value} can send again`);
  refresh();
}

/** Logs a copyright claim. The track is found by its receipt token or its id. */
export async function openTakedown(form: FormData) {
  const a = await requireAdminAction("super");
  const claimant = String(form.get("claimant") || "").trim().slice(0, 120);
  const claimantEmail = normalEmail(String(form.get("claimant_email") || "")).slice(0, 200);
  const ref = String(form.get("track") || "").trim().slice(0, 100);
  if (!claimant || !claimantEmail.includes("@") || !ref) return fail("Fill in the claimant, a valid email and the track");
  const t = await q.get<{ id: number; title: string; artist: string; handle: string }>(
    "SELECT t.id, t.title, t.artist, u.handle FROM tracks t JOIN users u ON u.id = t.user_id WHERE t.token = ? OR t.id::text = ?",
    ref,
    ref,
  );
  const label = t ? `${t.artist} – ${t.title} (@${t.handle})` : `Not found: ${ref}`;
  await q.run(
    "INSERT INTO takedowns (track_id, track_label, claimant, claimant_email, basis, admin_id, created_at) VALUES (?,?,?,?,?,?,?)",
    t?.id ?? null, label, claimant, claimantEmail, String(form.get("basis") || "").trim().slice(0, 2000), a.id, now(),
  );
  await logAdmin(a.id, "opened takedown", label, claimant);
  await done(t ? `Case opened for ${label}` : `Case opened, but no track matched "${ref}"`);
  refresh();
}

/** Closes a case: removes the track (and its file) or rejects the claim, with a note for the record. */
export async function decideTakedown(id: number, outcome: "removed" | "rejected", form: FormData) {
  const a = await requireAdminAction("super");
  const c = await q.get<{ id: number; track_id: number | null; track_label: string; status: string }>("SELECT id, track_id, track_label, status FROM takedowns WHERE id = ?", id);
  if (!c || c.status !== "open") return fail("That case is already closed");
  const notes = String(form.get("notes") || "").trim().slice(0, 1000);
  const owner = c.track_id
    ? await q.get<{ id: number; email: string; title: string; artist: string }>("SELECT u.id, u.email, t.title, t.artist FROM tracks t JOIN users u ON u.id = t.user_id WHERE t.id = ?", c.track_id)
    : undefined;
  if (outcome === "removed" && c.track_id) await removeTrackAsAdmin(c.track_id, `takedown #${c.id}`);
  await q.run("UPDATE takedowns SET status = ?, notes = ?, decided_at = ?, admin_id = ? WHERE id = ? AND status = 'open'", outcome, notes, now(), a.id, c.id);
  await logAdmin(a.id, outcome === "removed" ? "upheld takedown" : "rejected takedown", c.track_label, notes);
  if (outcome === "removed" && owner)
    await sendMail({
      userId: owner.id,
      audience: "support",
      to: owner.email,
      subject: "A track was removed from your desk",
      body: [
        "Hi,",
        "",
        `We removed "${owner.artist} – ${owner.title}" from your desk after a copyright claim, and deleted the file. You don't need to do anything.`,
        "",
        `If you have questions, contact us: ${env.appUrl}/contact`,
        "",
        "— FloorTest",
      ].join("\n"),
    }).catch(() => {});
  await done(outcome === "removed" ? "Track removed; receiver emailed" : "Claim rejected");
  refresh();
}

/** Admin side of a privacy request. The typed address has to match before anything is deleted. */
export async function adminDeleteAccount(userId: number, form: FormData) {
  const a = await requireAdminAction("super");
  const u = await target(userId);
  if (!u || u.id === a.id || String(form.get("confirm") || "").trim().toLowerCase() !== u.email.toLowerCase()) return fail("Nothing deleted: the email you typed didn't match");
  await purgeAccount(u.id);
  await logAdmin(a.id, "deleted account (privacy request)", `@${u.handle}`, u.email.replace(/^(.{2}).*@/, "$1…@"));
  refresh();
  redirect(`/admin/privacy?done=account`);
}

export async function adminEraseSender(form: FormData) {
  const a = await requireAdminAction("super");
  const email = normalEmail(String(form.get("email") || ""));
  if (!EMAIL_RE.test(email) || normalEmail(String(form.get("confirm") || "")) !== email) return fail("Nothing erased: the email you typed didn't match");
  const r = await eraseSender(email);
  await logAdmin(a.id, "erased sender (privacy request)", email.replace(/^(.{2}).*@/, "$1…@"), `${r.senders} sender records, ${r.files} files`);
  refresh();
  redirect(`/admin/privacy?done=sender`);
}

/** Turns a held-back feature on for chosen plans and named accounts (by handle). */
export async function saveSwitch(feature: Feature, form: FormData) {
  const a = await requireAdminAction("switches");
  if (!(feature in FEATURES)) return;
  const plans = (await allPlans()).map((p) => p.id).filter((p) => form.get(`plan_${p}`) === "on");
  const handles = [...new Set(String(form.get("handles") || "").split(/[\s,]+/).map((h) => h.replace(/^@/, "").toLowerCase()).filter(Boolean))].slice(0, 200);
  const users = handles.length
    ? (await q.all<{ id: number }>(`SELECT id FROM users WHERE lower(handle) IN (${handles.map(() => "?").join(",")})`, ...handles)).map((r) => r.id)
    : [];
  await q.run(
    "INSERT INTO feature_switches (feature, plans, users, admin_id, updated_at) VALUES (?,?,?,?,?) ON CONFLICT (feature) DO UPDATE SET plans = excluded.plans, users = excluded.users, admin_id = excluded.admin_id, updated_at = excluded.updated_at",
    feature, JSON.stringify(plans), JSON.stringify(users), a.id, now(),
  );
  await logAdmin(a.id, "changed feature switch", FEATURES[feature].label, `plans: ${plans.join(", ") || "none"} · accounts: ${users.length}`);
  revalidatePath("/", "layout");
}

/** Publishes to the bell of everyone matching the filters; with email on, also emails those of them who opted into product news. */
export async function publishAnnouncement(form: FormData) {
  const a = await requireAdminAction("announcements");
  const title = String(form.get("title") || "").trim().slice(0, 100);
  const body = String(form.get("body") || "").trim().slice(0, 600);
  const href = String(form.get("href") || "").trim().slice(0, 200);
  const aud = readAudience((k) => form.get(k));
  const list = form.get("list") === "marketing" ? "marketing" : form.get("list") === "product" ? "product" : null;
  const email = !!list;
  const consent = list === "marketing" ? "u.notify_marketing = 1" : "u.notify_product = 1";
  const outside = email && form.get("subscribers") === "on";
  // Links must stay on FloorTest: "/path" only, never "//host", "/\host" or javascript: (src/lib/safe-links.ts).
  if (!title || (href && !localPath(href))) return fail("Needs a title, and links must start with /");
  const plans = await allPlans();
  const label = describeAudience(aud, (id) => plans.find((p) => p.id === id)?.name ?? id);
  const w = audienceWhere(aud);
  const id = (await q.get<{ id: number }>(
    "INSERT INTO announcements (title, body, href, audience, emailed, admin_id, created_at) VALUES (?,?,?,?,?,?,?) RETURNING id",
    title, body, href, label, email ? 1 : 0, a.id, now(),
  ))!.id;
  await q.run(`INSERT INTO announcement_recipients (announcement_id, user_id) SELECT ?, u.id FROM users u WHERE ${w.sql}`, id, ...w.args);
  const people = email
    ? await q.all<{ id: number; email: string }>(
        `SELECT u.id, u.email FROM users u WHERE ${w.sql} AND ${consent} AND u.email_verified_at IS NOT NULL LIMIT 5000`,
        ...w.args,
      )
    : [];
  // People without an account who confirmed the newsletter (and, for offers, opted into those too).
  const subscribers = outside
    ? await q.all<{ email: string; token: string }>(
        `SELECT s.email, s.token FROM newsletter_subscribers s WHERE s.confirmed_at IS NOT NULL AND s.unsubscribed_at IS NULL ${list === "marketing" ? "AND s.marketing = 1" : ""}
           AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = s.email) LIMIT 5000`,
      )
    : [];
  await logAdmin(a.id, "published announcement", title, `${label}${email ? ` · ${list} email to ${people.length} accounts${outside ? ` + ${subscribers.length} subscribers` : ""}` : ""}`);
  if (people.length || subscribers.length)
    after(async () => {
      for (const p of people)
        await sendMail({
      unsubscribe: list === "marketing" ? "marketing" : "product",
          userId: p.id,
          audience: "receiver",
          to: p.email,
          subject: title,
          body: [body, "", href ? `${env.appUrl}${href}` : env.appUrl, "", list === "marketing" ? "You get these because offers and promotions are on in your notification settings." : "You get these because the newsletter is on in your notification settings.", "FloorTest"].join("\n"),
        }).catch(() => {});
      for (const sub of subscribers)
        await sendMail({ userId: null, audience: "support", to: sub.email, subject: title, body: [body, "", href ? `${env.appUrl}${href}` : env.appUrl, "", newsletterFooter(sub.token)].join("\n") }).catch(() => {});
    });
  refresh();
  await done(people.length + subscribers.length ? `Published; emailing ${people.length + subscribers.length} people` : "Published");
  redirect("/admin/announcements?published=1");
}

/** Moves an account to a new handle. For impersonation, the old name is released (no forwarding) and can be protected. */
export async function adminChangeHandle(userId: number, form: FormData) {
  const a = await requireAdminAction("super");
  const u = await target(userId);
  if (!u) return fail("Account not found");
  const takeback = form.get("takeback") === "on";
  const reason = String(form.get("reason") || "").trim().slice(0, 200);
  if (reason.length < 5) return fail("Add a reason (at least a few words) for the record");
  const problem = await changeHandle(u.id, String(form.get("handle") || ""), { forward: !takeback, checks: false });
  if (problem) return fail(problem);
  const fresh = await target(userId);
  if (takeback && form.get("protect") === "on") {
    const { normalizeName } = await import("@/lib/identity");
    await q.run("INSERT INTO protected_names (handle, note, created_at) VALUES (?,?,?) ON CONFLICT (handle) DO NOTHING", normalizeName(u.handle), `taken back from #${u.id}`, now());
  }
  await logAdmin(a.id, takeback ? "took back handle" : "changed handle", `@${u.handle}`, `now @${fresh?.handle} · ${reason}`);
  if (fresh && fresh.handle !== u.handle)
    await sendMail({
      userId: u.id,
      audience: "support",
      to: u.email,
      subject: "Your FloorTest link changed",
      body: takeback
        ? `Hi,\n\nWe've changed your FloorTest link to ${env.appUrl}/${fresh.handle} because the name you had belongs to another artist. Reason: ${reason}\n\nIf you think this is a mistake, contact us: ${env.appUrl}/contact\n\n— FloorTest`
        : `Hi,\n\nAs requested, your FloorTest link is now ${env.appUrl}/${fresh.handle}. Your old link forwards there for ${HANDLE_HOLD_DAYS} days, then anyone can claim it, so update your bios now.\n\n— FloorTest`,
    }).catch(() => {});
  await done(`@${u.handle} is now @${fresh?.handle}${takeback ? "; old name released" : `; old link forwards for ${HANDLE_HOLD_DAYS} days`}`);
  refresh();
}

/** Starts an email change for someone who can't do it themselves. The new address still has to confirm. */
export async function adminChangeEmail(userId: number, form: FormData) {
  const a = await requireAdminAction("super");
  const u = await target(userId);
  if (!u) return fail("Account not found");
  const how = String(form.get("how") || "").trim().slice(0, 200);
  if (how.length < 5) return fail("Say how you confirmed it's them, for the record");
  const problem = await requestEmailChange(u.id, String(form.get("email") || ""), "admin");
  if (problem) return fail(problem);
  await logAdmin(a.id, "started email change", `@${u.handle}`, how);
  await done("Confirmation sent to the new address; the old one was told");
  refresh();
}

export async function adminCancelEmailChange(userId: number) {
  const a = await requireAdminAction("super");
  const u = await target(userId);
  if (!u) return fail("Account not found");
  await cancelEmailChange(u.id);
  await logAdmin(a.id, "cancelled email change", `@${u.handle}`);
  await done("Email change cancelled");
  refresh();
}

/** Marks an incident as dealt with, so it leaves the Overview to-do list. */
export async function resolveIncident(id: number) {
  const a = await requireAdminAction("incidents.act");
  const r = await q.run("UPDATE incidents SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL", now(), id);
  if (r.changes) await logAdmin(a.id, "resolved incident", `#${id}`);
  await done("Marked handled");
  refresh();
}

/** Clears every open incident (of one kind, or all). For stale ones after a fix has shipped. */
export async function resolveAllIncidents(kind: string) {
  const a = await requireAdminAction("incidents.act");
  const r = kind
    ? await q.run("UPDATE incidents SET resolved_at = ? WHERE resolved_at IS NULL AND kind = ?", now(), kind)
    : await q.run("UPDATE incidents SET resolved_at = ? WHERE resolved_at IS NULL", now());
  await logAdmin(a.id, "resolved incidents", kind || "all", `${r.changes}`);
  await done(`Marked ${r.changes} incident${r.changes === 1 ? "" : "s"} handled`);
  refresh();
}

/** Flips a site-wide switch (sharing, bot check, open sign-up, pause uploads). Takes effect on the next request. */
export async function flipSwitch(key: SwitchKey, on: boolean) {
  const a = await requireAdminAction("super");
  if (!(key in SWITCHES)) return fail("Unknown switch");
  await setSwitch(key, on, a.id);
  await logAdmin(a.id, on ? "switched on" : "switched off", SWITCHES[key].label);
  await done(`${SWITCHES[key].label}: ${on ? "on" : "off"}`);
  revalidatePath("/", "layout");
}

/**
 * Sets "who sees it" on a targeted switch: named accounts (handles), account types, plans, countries and a percentage.
 * On/off is unchanged; a rule with nothing in it clears the rule. Unknown handles are refused rather than dropped.
 */
export async function saveSwitchRule(key: SwitchKey, form: FormData) {
  const a = await requireAdminAction("super");
  if (!(key in SWITCHES) || !isTargeted(key)) return fail("That switch can't take a rule");
  const handles = [...new Set(String(form.get("handles") || "").split(/[\s,]+/).map((h) => h.replace(/^@/, "").toLowerCase()).filter(Boolean))];
  if (handles.length > MAX_RULE_ACCOUNTS) return fail(`At most ${MAX_RULE_ACCOUNTS} named accounts`);
  const found = handles.length
    ? await q.all<{ id: number; handle: string }>(`SELECT id, lower(handle) AS handle FROM users WHERE lower(handle) IN (${handles.map(() => "?").join(",")})`, ...handles)
    : [];
  const missing = handles.filter((h) => !found.some((f) => f.handle === h));
  if (missing.length) return fail(`No account with ${missing.map((h) => `@${h}`).join(", ")}`);
  const plans = await allPlans();
  const rule = readRule(
    JSON.stringify({
      accounts: found.map((f) => Number(f.id)),
      types: Object.keys(ACCOUNT_TYPES).filter((t) => isAccountType(t) && form.get(`type_${t}`) === "on"),
      plans: plans.map((p) => p.id).filter((p) => form.get(`plan_${p}`) === "on"),
      countries: parseCountries(String(form.get("countries") || "")),
      percent: clampPercent(form.get("percent")),
    }),
  );
  await setSwitchRule(key, rule, a.id);
  const words = rule ? describeRule(rule, (id) => plans.find((p) => p.id === id)?.name ?? id) : "everyone";
  await logAdmin(a.id, rule ? "set switch rule" : "cleared switch rule", SWITCHES[key].label, words);
  await done(`${SWITCHES[key].label}: ${rule ? words : "for everyone when on"}`);
  revalidatePath("/", "layout");
}

/** Clears a targeted switch's rule: when on, it is on for everyone again. */
export async function clearSwitchRule(key: SwitchKey) {
  const a = await requireAdminAction("super");
  if (!(key in SWITCHES) || !isTargeted(key)) return fail("That switch can't take a rule");
  await setSwitchRule(key, null, a.id);
  await logAdmin(a.id, "cleared switch rule", SWITCHES[key].label, "everyone");
  await done(`${SWITCHES[key].label}: for everyone when on`);
  revalidatePath("/", "layout");
}

/** Lets email go to an address again after a bounce or spam report (for example, once they've fixed their mailbox). */
export async function liftSuppression(email: string) {
  const a = await requireAdminAction("users.support");
  await q.run("DELETE FROM email_suppressions WHERE email = ?", normalEmail(email));
  await logAdmin(a.id, "lifted email block", email);
  await done(`Email to ${email} allowed again`);
  refresh();
}

/* ───────────────────────── Beta partners and feedback ───────────────────────── */

export async function savePartnerNote(email: string, form: FormData) {
  const a = await requireAdminAction("partners.act");
  const key = normalEmail(email).slice(0, 200);
  if (!key) return;
  const note = String(form.get("note") || "").slice(0, 4000);
  await q.run(
    `INSERT INTO partner_notes (email, note, admin_id, updated_at) VALUES (?,?,?,?)
     ON CONFLICT (email) DO UPDATE SET note = excluded.note, admin_id = excluded.admin_id, updated_at = excluded.updated_at`,
    key,
    note,
    a.id,
    now(),
  );
  await logAdmin(a.id, "partner note", key);
  await done("Note saved");
  refresh();
}

const FEEDBACK_STATUSES = ["new", "planned", "fixed", "wontdo"] as const;

export async function setFeedbackStatus(id: number, status: string) {
  const a = await requireAdminAction("feedback.act");
  if (!(FEEDBACK_STATUSES as readonly string[]).includes(status) || !Number.isSafeInteger(id)) return;
  await q.run("UPDATE contact_messages SET feedback_status = ?, handled_at = ? WHERE id = ? AND topic LIKE 'Feedback%'", status, status === "new" ? null : now(), id);
  await logAdmin(a.id, "feedback status", `#${id}`, status);
  await done(status === "new" ? "Moved back to New" : `Marked ${status === "wontdo" ? "won't do" : status}`);
  refresh();
}

/** Biggest active-track count among a plan's accounts (bonus slots excluded), so a limit cut can't strand anyone. */
const fullestOn = async (plan: string) =>
  (await q.get<{ n: number }>("SELECT COALESCE(MAX(c), 0) AS n FROM (SELECT COUNT(t.id) AS c FROM users u LEFT JOIN tracks t ON t.user_id = u.id AND t.deleted_at IS NULL WHERE u.plan = ? GROUP BY u.id) x", plan))!.n;

export async function savePlan(id: string, form: FormData) {
  const a = await requireAdminAction("super");
  const old = (await allPlans()).find((p) => p.id === id);
  if (!old) return fail("That plan no longer exists.");
  const name = String(form.get("name") || "").trim().slice(0, 40);
  const price = Math.round(Number(form.get("price")) * 100);
  const yearly = Math.round(Number(form.get("yearly") || 0) * 100);
  const limit = Math.floor(Number(form.get("limit")));
  const blurb = String(form.get("blurb") || "").trim().slice(0, 200);
  const features = String(form.get("features") || "").split("\n").map((f) => f.trim()).filter(Boolean).slice(0, 20).map((f) => f.slice(0, 120));
  const position = Math.floor(Number(form.get("position")) || 0);
  const folderMb = Math.floor(Number(form.get("folder_mb")) || 0);
  const seats = Math.floor(Number(form.get("seats")) || 1);
  if (!name) return fail("Give the plan a name.");
  if (seats < 1 || seats > 500) return fail("Seats must be between 1 and 500.");
  if (folderMb < 0 || folderMb > 20480) return fail("Folder limit must be between 0 and 20,480 MB.");
  if (!Number.isFinite(price) || price < 0 || price > 100000) return fail("Price must be between $0 and $1,000.");
  if (id === FREE_PLAN && price !== 0) return fail("Free must stay at $0.");
  if (!Number.isFinite(yearly) || yearly < 0 || yearly > 1000000) return fail("Yearly price must be between $0 and $10,000.");
  if (id === FREE_PLAN && yearly !== 0) return fail("Free has no yearly price.");
  // Discount: a percentage off list prices, optional label, optional last day (inclusive, end of that day UTC).
  const discountPct = Math.round(Number(form.get("discount_pct") || 0));
  const discountLabel = String(form.get("discount_label") || "").trim().slice(0, 40);
  const endsOn = String(form.get("discount_ends") || "").trim();
  const discountEndsAt = endsOn ? Date.parse(`${endsOn}T23:59:59Z`) : null;
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 90) return fail("Discount must be between 0% and 90%.");
  if (id === FREE_PLAN && discountPct) return fail("Free can't have a discount.");
  if (endsOn && (discountEndsAt == null || !Number.isFinite(discountEndsAt))) return fail("Pick a valid end date for the discount.");
  if (!Number.isFinite(limit) || limit < 1 || limit > 1000000) return fail("Track limit must be at least 1.");
  const fullest = await fullestOn(id);
  if (limit < fullest) return fail(`Someone on ${old.name} already has ${fullest} active tracks, so the limit can't go below that.`);
  await q.run(
    "UPDATE plans SET name = ?, price_cents = ?, yearly_price_cents = ?, discount_pct = ?, discount_label = ?, discount_ends_at = ?, track_limit = ?, blurb = ?, features = ?, track_art = ?, featured = ?, position = ?, folder_bytes = ?, seats = ?, updated_at = ? WHERE id = ?",
    name, price, yearly, discountPct, discountLabel, discountPct ? discountEndsAt : null, limit, blurb, JSON.stringify(features), form.get("track_art") === "on" ? 1 : 0, form.get("featured") === "on" ? 1 : 0, position, folderMb * 1048576, seats, now(), id,
  );
  const changes = [
    old.price * 100 !== price && `price $${old.price} → $${price / 100}`,
    Math.round(old.yearly * 100) !== yearly && `yearly $${old.yearly} → $${yearly / 100}`,
    old.discount.pct !== discountPct && `discount ${old.discount.pct}% → ${discountPct}%`,
    old.limit !== limit && `limit ${old.limit} → ${limit}`,
    old.name !== name && `name ${old.name} → ${name}`,
    old.folderBytes !== folderMb * 1048576 && `folders ${Math.round(old.folderBytes / 1048576)} → ${folderMb} MB`,
    old.seats !== seats && `seats ${old.seats} → ${seats}`,
  ].filter(Boolean);
  await logAdmin(a.id, "edited plan", id, changes.join(" · ") || "wording");
  await done(`${name} saved.`);
  revalidatePath("/", "layout");
}

export async function addPlan(form: FormData) {
  const a = await requireAdminAction("super");
  const id = String(form.get("id") || "").trim().toLowerCase();
  const name = String(form.get("name") || "").trim().slice(0, 40);
  if (!/^[a-z][a-z0-9_]{1,23}$/.test(id)) return fail("The plan code must be 2–24 lowercase letters, numbers or _, starting with a letter.");
  if (!name) return fail("Give the plan a name.");
  if ((await allPlans()).some((p) => p.id === id)) return fail("A plan with that code already exists.");
  const position = ((await q.get<{ p: number }>("SELECT COALESCE(MAX(position), 0) AS p FROM plans"))!.p) + 1;
  // New plans start retired (hidden) so they can be filled in before anyone sees them.
  await q.run(
    "INSERT INTO plans (id, name, price_cents, track_limit, blurb, features, featured, position, retired_at, updated_at) VALUES (?,?,?,?,?,?,0,?,?,?)",
    id, name, 0, 20, "", "[]", position, now(), now(),
  );
  await logAdmin(a.id, "added plan", id, name);
  await done(`${name} added. It's hidden until you offer it.`);
  revalidatePath("/", "layout");
}

export async function setPlanOffered(id: string, offered: boolean) {
  const a = await requireAdminAction("super");
  if (id === FREE_PLAN && !offered) return fail("Free can't be retired: every account falls back to it.");
  await q.run("UPDATE plans SET retired_at = ?, updated_at = ? WHERE id = ?", offered ? null : now(), now(), id);
  await logAdmin(a.id, offered ? "offered plan" : "retired plan", id);
  await done(offered ? "Plan is offered again." : "Plan retired. Current users keep it; nobody new can pick it.");
  revalidatePath("/", "layout");
}

export async function deletePlan(id: string) {
  const a = await requireAdminAction("super");
  if (id === FREE_PLAN) return fail("Free can't be deleted.");
  const n = (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE plan = ?", id))!.n;
  if (n) return fail(`${n} account${n === 1 ? " is" : "s are"} on this plan. Retire it instead, or move them first.`);
  await q.run("DELETE FROM plans WHERE id = ?", id);
  await logAdmin(a.id, "deleted plan", id);
  await done("Plan deleted.");
  revalidatePath("/", "layout");
}

/** Admin → Site content: save a page's draft, and publish it when the Publish button was pressed. */
export async function saveContent(page: SitePage, form: FormData) {
  const a = await requireAdminAction("content");
  const def = SITE_PAGES[page];
  if (!def) return;
  const publish = form.get("intent") === "publish";
  await writeContent(page, Object.fromEntries(Object.keys(def.fields).map((k) => [k, form.get(k)])), a.id, publish, false);
  await done(publish ? `${def.label} published.` : `${def.label} draft saved. Preview it, then publish.`);
  refresh();
}

/** Copy an older published version back into the draft (it goes live only when published). */
export async function restoreContent(page: string, versionId: number) {
  const a = await requireAdminAction("content");
  if (!contentKeys.includes(page)) return;
  const v = await q.get<{ body: string }>("SELECT body FROM site_content_versions WHERE id = ? AND page = ?", versionId, page);
  if (!v) return fail("That version no longer exists.");
  await q.run("UPDATE site_content SET draft = ?, admin_id = ?, updated_at = ? WHERE page = ?", v.body, a.id, now(), page);
  await logAdmin(a.id, "restored content version", page, `version ${versionId}`);
  await done("Version copied into the draft. Preview it, then publish.");
  refresh();
}

/** Throw the draft away: it goes back to what's published. */
export async function discardDraft(page: string) {
  const a = await requireAdminAction("content");
  if (!contentKeys.includes(page)) return;
  // Keep the thrown-away draft in the version history, so a mis-click can be undone with Restore.
  const cur = await q.get<{ draft: string; published: string }>("SELECT draft, published FROM site_content WHERE page = ?", page);
  if (cur && cur.draft !== cur.published) await q.run("INSERT INTO site_content_versions (page, body, admin_id, created_at) VALUES (?,?,?,?)", page, cur.draft, a.id, now());
  await q.run("UPDATE site_content SET draft = published, admin_id = ?, updated_at = ? WHERE page = ?", a.id, now(), page);
  await logAdmin(a.id, "discarded content draft", page);
  await done("Draft discarded. It's kept in the history below if you need it back.");
  refresh();
}

const contentKeys: string[] = [...Object.keys(SITE_PAGES), ...(Object.keys(EMAILS) as EmailId[]).map(emailKey)];

/** Admin → Site content → Emails: save an email's wording as a draft, or publish it so it's used from the next send. */
export async function saveEmail(id: EmailId, form: FormData) {
  const a = await requireAdminAction("content");
  const def = EMAILS[id];
  if (!def) return;
  const subject = String(form.get("subject") ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || def.subject;
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 6000) || def.body;
  const unknown = [...`${subject} ${body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !(k in def.vars));
  if (unknown.length) return fail(`Unknown fill-in: {${unknown[0]}}. Use only the ones listed.`);
  const json = JSON.stringify({ subject, body });
  const publish = form.get("intent") === "publish";
  const key = emailKey(id);
  const t = now();
  await q.run(
    `INSERT INTO site_content (page, draft, published, admin_id, updated_at, published_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT (page) DO UPDATE SET draft = excluded.draft, admin_id = excluded.admin_id, updated_at = excluded.updated_at${publish ? ", published = excluded.published, published_at = excluded.published_at" : ""}`,
    key, json, publish ? json : "{}", a.id, t, publish ? t : null,
  );
  if (publish) {
    await q.run("INSERT INTO site_content_versions (page, body, admin_id, created_at) VALUES (?,?,?,?)", key, json, a.id, t);
    await logAdmin(a.id, "published email wording", def.label);
  }
  await done(publish ? `${def.label} email published: it's used from the next send.` : `${def.label} draft saved.`);
  refresh();
}

/** Send the draft, filled with example details, to the admin's own address. */
export async function sendTestEmail(id: EmailId) {
  const a = await requireAdminAction("content");
  if (!EMAILS[id]) return;
  const t = await emailTemplate(id, "draft");
  const status = await sendMail({ userId: null, audience: "support", to: a.email, subject: `[Test] ${fillEmail(t.subject, SAMPLE_VARS)}`, body: fillEmail(t.body, SAMPLE_VARS) });
  if (status.startsWith("failed")) return fail(`Test didn't send: ${status}`);
  await done(`Test sent to ${a.email}.`);
}

/** Private admin tags on an account, used to filter Users and announcements. */
export async function saveTags(userId: number, form: FormData) {
  const a = await requireAdminAction("users.support");
  const u = await target(userId);
  if (!u) return;
  const tags = cleanTags(String(form.get("tags") || ""));
  await q.run("UPDATE users SET admin_tags = ? WHERE id = ?", tags, userId);
  await logAdmin(a.id, "tagged account", `@${u.handle}`, tags || "none");
  await done("Tags saved.");
  refresh();
}

/** A private note on an account, visible only in Admin. */
export async function addNote(userId: number, form: FormData) {
  const a = await requireAdminAction("users.support");
  const body = String(form.get("note") || "").trim().slice(0, 2000);
  if (!body || !(await target(userId))) return fail("Write a note first.");
  await q.run("INSERT INTO account_notes (user_id, admin_id, body, created_at) VALUES (?,?,?,?)", userId, a.id, body, now());
  await done("Note added.");
  refresh();
}

/* Ops team: the super admin adds people with a role and can tick extra access or take some away. */

const roleOf = (v: FormDataEntryValue | null): Role | null => (typeof v === "string" && v in ROLES ? (v as Role) : null);

/** Ticked boxes against the role's defaults: what to add on top, and what to take away. */
function grantsAndDenials(role: Role, form: FormData) {
  const ticked = new Set((form.getAll("perm") as string[]).filter((p): p is Perm => p in PERMS));
  const defaults = new Set(ROLE_PERMS[role]);
  return {
    grant: [...ticked].filter((p) => !defaults.has(p)).join(","),
    deny: [...defaults].filter((p) => !ticked.has(p)).join(","),
  };
}

export async function addOpsMember(form: FormData) {
  const a = await requireAdminAction("super");
  const email = normalEmail(String(form.get("email") || "")).slice(0, 200);
  const role = roleOf(form.get("role"));
  if (!role) return fail("Pick a role.");
  const u = await q.get<{ id: number; handle: string; email_verified_at: number | null; suspended_at: number | null }>("SELECT id, handle, email_verified_at, suspended_at FROM users WHERE email = ?", email);
  // Only existing, confirmed accounts: nobody can sign up later with an address and inherit access.
  if (!u) return fail("No FloorTest account uses that email. Ask them to sign up and confirm their email first.");
  if (!u.email_verified_at) return fail("They need to confirm their email before they can join the ops team.");
  if (u.suspended_at) return fail("That account is suspended.");
  if (isAdminEmail(email)) return fail("That's a super admin already.");
  const r = await q.run("INSERT INTO ops_members (user_id, role, invited_by, created_at) VALUES (?,?,?,?) ON CONFLICT (user_id) DO NOTHING", u.id, role, a.id, now());
  if (!r.changes) return fail(`@${u.handle} is already on the ops team. Change their role below.`);
  await logAdmin(a.id, "added to ops team", `@${u.handle}`, ROLES[role]);
  await done(`Added @${u.handle} as ${ROLES[role]}. They sign in at the ops sign-in with two-step on.`);
  refresh();
}

export async function saveOpsMember(userId: number, form: FormData) {
  const a = await requireAdminAction("super");
  const role = roleOf(form.get("role"));
  if (!role) return fail("Pick a role.");
  const before = await q.get<{ role: Role; grant_perms: string; deny_perms: string; handle: string }>(
    "SELECT m.role, m.grant_perms, m.deny_perms, u.handle FROM ops_members m JOIN users u ON u.id = m.user_id WHERE m.user_id = ?",
    userId,
  );
  if (!before) return fail("They're not on the ops team.");
  // A role change starts from that role's defaults; otherwise the ticked boxes decide.
  const { grant, deny } = role === before.role ? grantsAndDenials(role, form) : { grant: "", deny: "" };
  await q.run("UPDATE ops_members SET role = ?, grant_perms = ?, deny_perms = ? WHERE user_id = ?", role, grant, deny, userId);
  await logAdmin(a.id, "changed ops access", `@${before.handle}`, `${ROLES[before.role]} → ${ROLES[role]}${grant ? ` · +${grant}` : ""}${deny ? ` · −${deny}` : ""}`);
  await done(role === before.role ? `Saved @${before.handle}'s access` : `@${before.handle} is now ${ROLES[role]}, with that role's defaults`);
  refresh();
}

export async function setOpsMemberDisabled(userId: number, disabled: boolean) {
  const a = await requireAdminAction("super");
  const m = await q.get<{ handle: string }>("SELECT u.handle FROM ops_members m JOIN users u ON u.id = m.user_id WHERE m.user_id = ?", userId);
  if (!m) return fail("They're not on the ops team.");
  await q.run("UPDATE ops_members SET disabled_at = ? WHERE user_id = ?", disabled ? now() : null, userId);
  // Signed out of ops at once, not at the end of their session.
  if (disabled) await q.run("DELETE FROM admin_sessions WHERE user_id = ?", userId);
  await logAdmin(a.id, disabled ? "removed ops access" : "restored ops access", `@${m.handle}`);
  await done(disabled ? `@${m.handle} no longer has ops access` : `@${m.handle} has ops access again`);
  refresh();
}

/* Plan requests (beta): people ask for Pro or Team; ops gives the plan that fits who they are. */

async function openRequest(id: number) {
  return q.get<PlanRequest & { email: string; handle: string; name: string; current: string }>(
    "SELECT r.*, u.email, u.handle, u.name, u.plan AS current FROM plan_requests r JOIN users u ON u.id = r.user_id WHERE r.id = ? AND r.status = 'pending'",
    id,
  );
}

export async function approvePlanRequest(id: number, form: FormData) {
  const a = await requireAdminAction("planRequests");
  const r = await openRequest(id);
  if (!r) return fail("That request was already dealt with.");
  const plan = grantablePlan(await allPlans(), String(form.get("plan") || r.plan), r.plan, r.current);
  if (!plan) return fail("Pick the plan they asked for, or one at or above their current plan.");
  const note = String(form.get("note") || "").trim().slice(0, 500);
  await q.tx(async (db) => {
    await db.run("UPDATE users SET plan = ? WHERE id = ?", plan.id, r.user_id);
    await db.run("UPDATE plan_requests SET status = 'approved', granted_plan = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?", plan.id, a.id, now(), note, id);
  });
  await logAdmin(a.id, "approved plan request", `@${r.handle}`, `${plan.name}${plan.id !== r.plan ? ` (asked for ${r.plan})` : ""}`);
  await sendMail({
    userId: r.user_id,
    to: r.email,
    subject: `You're on ${plan.name} — FloorTest`,
    body: `Hi ${r.name.split(/\s+/)[0] || r.name},\n\nYou're on ${plan.name} now, free for the rest of the beta: room for ${plan.limit.toLocaleString("en")} active tracks.${plan.id !== r.plan ? ` (You asked for ${r.plan}; ${plan.name} fits how you work better for now. Reply if you think otherwise.)` : ""}${note ? `\n\n${note}` : ""}\n\nSee it: ${APP_URL}/dashboard/plans\n\n— FloorTest`,
  }).catch(() => {});
  await done(`@${r.handle} is on ${plan.name} and has been emailed.`);
  refresh();
}

export async function declinePlanRequest(id: number, form: FormData) {
  const a = await requireAdminAction("planRequests");
  const r = await openRequest(id);
  if (!r) return fail("That request was already dealt with.");
  const reason = String(form.get("reason") || "").trim().slice(0, 500);
  if (!reason) return fail("Give a short reason; it's sent to them.");
  await q.run("UPDATE plan_requests SET status = 'declined', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?", a.id, now(), reason, id);
  await logAdmin(a.id, "declined plan request", `@${r.handle}`, reason.slice(0, 120));
  await sendMail({
    userId: r.user_id,
    to: r.email,
    subject: "About your FloorTest plan request",
    body: `Hi ${r.name.split(/\s+/)[0] || r.name},\n\nThanks for asking for ${r.plan}. We're not moving you for now:\n\n${reason}\n\nYou keep everything on your current plan, and you can ask again any time from Account → Plans.\n\n— FloorTest`,
  }).catch(() => {});
  await done(`Declined @${r.handle}'s request; they've been emailed.`);
  refresh();
}

