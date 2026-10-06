"use server";

import crypto from "node:crypto";
import { EMAILS, emailKey, emailTemplate, emailText, fillEmail, SAMPLE_VARS, type EmailId } from "@/lib/email-copy";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { FEATURES, type Feature } from "@/lib/features";
import { allPlans, FREE_PLAN } from "@/lib/plan-store";
import { audienceWhere, cleanTags, describeAudience, readAudience } from "@/lib/audience";
import { SITE_PAGES, type Field, type SitePage } from "@/lib/content";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signViewAs, VIEW_AS_COOKIE } from "@/lib/auth";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { logAdmin, requireAdminAction } from "@/lib/admin";
import { flash } from "@/lib/flash";
import { setSwitch, SWITCHES, type SwitchKey } from "@/lib/switches";
import { drainNow, retireTrackFiles } from "@/lib/deletion";
import { cancelEmailChange, changeHandle, HANDLE_HOLD_DAYS, requestEmailChange } from "@/lib/accounts";
import { logEvent, now, q, type Track } from "@/lib/db";
import { storage } from "@/lib/storage";
import { eraseSender, purgeAccount } from "@/lib/privacy";

const refresh = () => revalidatePath("/admin", "layout");
const done = (m: string) => flash(m);
const fail = async (m: string) => {
  await flash(m, "error");
  refresh();
};
const target = async (id: number) => q.get<{ id: number; email: string; handle: string }>("SELECT id, email, handle FROM users WHERE id = ?", id);

export async function suspendAccount(userId: number, reason: string) {
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u || u.id === a.id) return fail("Couldn't suspend: account not found, or it's yours");
  const why = String(reason || "").trim().slice(0, 200);
  const r = await q.tx(async (db) => {
    const r = await db.run("UPDATE users SET suspended_at = ?, suspended_reason = ? WHERE id = ? AND suspended_at IS NULL", now(), why, u.id);
    if (!r.changes) return r;
    await db.run("DELETE FROM sessions WHERE user_id = ?", u.id);
    await db.run("INSERT INTO account_actions (user_id, kind, reason, admin_id, created_at) VALUES (?,?,?,?,?)", u.id, "suspended", why, a.id, now());
    await db.run("INSERT INTO admin_log (admin_id, action, target, detail, created_at) VALUES (?,?,?,?,?)", a.id, "suspended", `@${u.handle}`, why, now());
    return r;
  });
  if (!r.changes) return fail("Already suspended");
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
  await done(`Suspended @${u.handle} and emailed them`);
  refresh();
}

export async function unsuspendAccount(userId: number) {
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u) return fail("Account not found");
  const r = await q.run("DELETE FROM sessions WHERE user_id = ?", u.id);
  await logAdmin(a.id, "signed out everywhere", `@${u.handle}`, `${r.changes} sessions`);
  await done(`Signed @${u.handle} out of ${r.changes} session${r.changes === 1 ? "" : "s"}`);
  refresh();
}

/** For a receiver locked out of their authenticator app after confirming who they are. */
export async function resetTwoFactor(userId: number, form: FormData) {
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u || !["free", "pro", "team"].includes(plan)) return fail("Couldn't change the plan");
  await q.run("UPDATE users SET plan = ? WHERE id = ?", plan, u.id);
  await logAdmin(a.id, "changed plan", `@${u.handle}`, plan);
  await done(`@${u.handle} is now on ${plan}`);
  refresh();
}

export async function createInvite(form: FormData) {
  const a = await requireAdminAction();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const typed = String(form.get("code") || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
  const code = typed || `FLOOR-${Array.from(crypto.randomBytes(5), (b) => alphabet[b % alphabet.length]).join("")}`;
  const max = Math.min(10_000, Math.max(1, Math.round(Number(form.get("max_uses")) || 25)));
  const note = String(form.get("note") || "").trim().slice(0, 120);
  await q.run("INSERT INTO invites (code, max_uses, note, created_at) VALUES (?,?,?,?) ON CONFLICT (code) DO NOTHING", code, max, note, now());
  await logAdmin(a.id, "created invite", code, `${max} uses${note ? ` · ${note}` : ""}`);
  await done(`Invite ${code} created`);
  refresh();
}

export async function revokeInvite(code: string) {
  const a = await requireAdminAction();
  await q.run("UPDATE invites SET revoked_at = ? WHERE code = ? AND revoked_at IS NULL", now(), code);
  await logAdmin(a.id, "revoked invite", code);
  await done(`Revoked ${code}`);
  refresh();
}

/** Takes down an abusive upload: file gone from storage, track gone from the receiver's desk. */
export async function removeTrackAsAdmin(trackId: number, reason: string) {
  const a = await requireAdminAction();
  const t = await q.get<Track & { handle: string }>(
    "SELECT t.*, u.handle FROM tracks t JOIN users u ON u.id = t.user_id WHERE t.id = ? AND t.deleted_at IS NULL",
    trackId,
  );
  if (!t) return fail("That track is already gone");
  await q.tx(async (db) => {
    await retireTrackFiles(db, [t.id], "removed by admin");
    await db.run("UPDATE tracks SET deleted_at = ?, file_key = NULL WHERE id = ?", now(), t.id);
  });
  await drainNow();
  await logEvent({ user_id: t.user_id, sender_id: t.sender_id, track_id: t.id, type: "deleted", detail: "removed by FloorTest" });
  await logAdmin(a.id, "removed track", `${t.artist} – ${t.title}`, `from @${t.handle}${reason ? ` · ${reason}` : ""}`);
  await done(`Removed "${t.title}" and its file`);
  refresh();
}

/** Blocks a sender email on one receiver's link (the same as the receiver blocking them). */
export async function blockSenderAsAdmin(senderId: number) {
  const a = await requireAdminAction();
  const s = await q.get<{ id: number; email: string; user_id: number }>("SELECT id, email, user_id FROM senders WHERE id = ?", senderId);
  if (!s) return fail("Sender not found");
  await q.run("UPDATE senders SET blocked_at = COALESCE(blocked_at, ?) WHERE id = ?", now(), s.id);
  await logAdmin(a.id, "blocked sender", s.email);
  await done(`Blocked ${s.email} on that link`);
  refresh();
}

/** Read-only look at someone's desk, for support. 30 minutes, logged. */
export async function startViewAs(userId: number) {
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u || u.id === a.id) return;
  (await cookies()).set(VIEW_AS_COOKIE, signViewAs(a.id, u.id, env.secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/dashboard",
    maxAge: 30 * 60,
  });
  await logAdmin(a.id, "viewed desk", `@${u.handle}`, "read-only, 30 min");
  redirect("/dashboard/floor");
}

/** Sends a logged email again, to the same address. */
export async function resendEmail(outboxId: number) {
  const a = await requireAdminAction();
  const m = await q.get<{ user_id: number | null; to_email: string; subject: string; body: string; audience: "sender" | "receiver" | "support" }>(
    "SELECT user_id, to_email, subject, body, audience FROM outbox WHERE id = ?",
    outboxId,
  );
  if (!m) return fail("Email not found");
  const status = await sendMail({ userId: m.user_id, to: m.to_email, subject: m.subject, body: m.body, audience: m.audience });
  await logAdmin(a.id, "resent email", m.subject, status);
  await done(status.startsWith("failed") ? `Resend failed: ${status}` : `Resent to ${m.to_email}`);
  refresh();
}

export async function setContactHandled(id: number, handled: boolean) {
  const a = await requireAdminAction();
  await q.run("UPDATE contact_messages SET handled_at = ? WHERE id = ?", handled ? now() : null, id);
  await logAdmin(a.id, handled ? "handled message" : "reopened message", `#${id}`);
  await done(handled ? "Marked handled" : "Reopened");
  refresh();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const newCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `FLOOR-${Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join("")}`;
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
  const a = await requireAdminAction();
  const note = String(form.get("note") || "").trim().slice(0, 300);
  const emails = [...new Set(String(form.get("emails") || "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, 50);
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
  const a = await requireAdminAction();
  const inv = await q.get<{ email: string | null; note: string }>("SELECT email, note FROM invites WHERE code = ? AND revoked_at IS NULL", code);
  if (!inv?.email) return fail("Couldn't resend: the invite is revoked or has no email");
  if ((await mailInvite(code, inv.email, a.name, inv.note)).startsWith("failed")) return fail("The email failed to send. Check Emails sent, then try again.");
  await q.run("UPDATE invites SET sent_at = ? WHERE code = ?", now(), code);
  await logAdmin(a.id, "resent invite", inv.email, code);
  await done(`Invite resent to ${inv.email}`);
  refresh();
}

/** Waitlist → personal invite in one click. */
export async function inviteFromWaitlist(id: number) {
  const a = await requireAdminAction();
  const w = await q.get<{ email: string; invited_at: number | null; handle: string }>("SELECT email, invited_at, handle FROM waitlist WHERE id = ?", id);
  if (!w || w.invited_at) return fail("Already invited");
  if (await q.get("SELECT 1 FROM users WHERE email = ?", w.email)) {
    await q.run("UPDATE waitlist SET invited_at = ? WHERE id = ?", now(), id);
    return fail("They already have an account");
  }
  const code = newCode();
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES (?,?,?,?,?)", code, 1, "From the waitlist", w.email, now());
  if ((await mailInvite(code, w.email, a.name, "", w.handle)).startsWith("failed")) return fail("The invite email failed to send. It's saved; resend it from Invites.");
  await q.run("UPDATE invites SET sent_at = ? WHERE code = ?", now(), code);
  await q.run("UPDATE waitlist SET invited_at = ? WHERE id = ?", now(), id);
  await logAdmin(a.id, "invited from waitlist", w.email, code);
  await done(`Invited ${w.email}`);
  refresh();
}

export async function removeFromWaitlist(id: number) {
  const a = await requireAdminAction();
  const w = await q.get<{ email: string }>("DELETE FROM waitlist WHERE id = ? RETURNING email", id);
  if (w) await logAdmin(a.id, "removed from waitlist", w.email);
  await done(w ? `Removed ${w.email} from the waitlist` : "Already removed");
  refresh();
}

/* Identity verification and protected names */

export async function approveIdentity(userId: number) {
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
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
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nWe've removed the Verified mark from your FloorTest page: ${note}\n\nYou can apply again from Settings: ${env.appUrl}/dashboard/settings#identity-h\n\nIf you think this is a mistake, reply to this email.\n\n— FloorTest`,
  });
  await logAdmin(a.id, "revoked verification", `@${u.handle}`, note);
  await done(`Removed @${u.handle}'s verification and emailed them`);
}

export async function rejectIdentity(userId: number, form: FormData) {
  const a = await requireAdminAction();
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
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nWe couldn't verify your profiles yet${note ? `: ${note}` : "."}\n\nYou can fix it and send it again from Settings: ${env.appUrl}/dashboard/settings#identity-h\n\n— FloorTest`,
  });
  await logAdmin(a.id, "rejected identity", `@${u.handle}`, note);
  await done(`Rejected @${u.handle}'s verification and emailed them`);
  refresh();
}

export async function addProtectedName(form: FormData) {
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
  const b = cleanBlock(String(form.get("value") || ""));
  if (!b) return fail("Enter an email address or a domain like example.com");
  const reason = String(form.get("reason") || "").trim().slice(0, 200);
  await q.run("INSERT INTO platform_blocks (kind, value, reason, admin_id, created_at) VALUES (?,?,?,?,?) ON CONFLICT (value) DO NOTHING", b.kind, b.value, reason, a.id, now());
  await logAdmin(a.id, `blocked ${b.kind} everywhere`, b.value, reason);
  await done(`Blocked ${b.value} everywhere`);
  refresh();
}

export async function blockEverywhere(email: string) {
  const f = new FormData();
  f.set("value", email);
  f.set("reason", "from moderation");
  await addPlatformBlock(f);
}

export async function removePlatformBlock(id: number) {
  const a = await requireAdminAction();
  const b = await q.get<{ value: string }>("SELECT value FROM platform_blocks WHERE id = ?", id);
  if (!b) return fail("Already lifted");
  await q.run("DELETE FROM platform_blocks WHERE id = ?", id);
  await logAdmin(a.id, "lifted platform block", b.value);
  await done(`${b.value} can send again`);
  refresh();
}

/** Logs a copyright claim. The track is found by its receipt token or its id. */
export async function openTakedown(form: FormData) {
  const a = await requireAdminAction();
  const claimant = String(form.get("claimant") || "").trim().slice(0, 120);
  const claimantEmail = String(form.get("claimant_email") || "").trim().toLowerCase().slice(0, 200);
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
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u || u.id === a.id || String(form.get("confirm") || "").trim().toLowerCase() !== u.email.toLowerCase()) return fail("Nothing deleted: the email you typed didn't match");
  await purgeAccount(u.id);
  await logAdmin(a.id, "deleted account (privacy request)", `@${u.handle}`, u.email.replace(/^(.{2}).*@/, "$1…@"));
  refresh();
  redirect(`/admin/privacy?done=account`);
}

export async function adminEraseSender(form: FormData) {
  const a = await requireAdminAction();
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || String(form.get("confirm") || "").trim().toLowerCase() !== email) return fail("Nothing erased: the email you typed didn't match");
  const r = await eraseSender(email);
  await logAdmin(a.id, "erased sender (privacy request)", email.replace(/^(.{2}).*@/, "$1…@"), `${r.senders} sender records, ${r.files} files`);
  refresh();
  redirect(`/admin/privacy?done=sender`);
}

/** Turns a held-back feature on for chosen plans and named accounts (by handle). */
export async function saveSwitch(feature: Feature, form: FormData) {
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
  const title = String(form.get("title") || "").trim().slice(0, 100);
  const body = String(form.get("body") || "").trim().slice(0, 600);
  const href = String(form.get("href") || "").trim().slice(0, 200);
  const aud = readAudience((k) => form.get(k));
  const email = form.get("email") === "on";
  // Links must stay on FloorTest: "/path" only, never "//host" or "/\host" (which browsers treat as another site).
  if (!title || (href && (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")))) return fail("Needs a title, and links must start with /");
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
        `SELECT u.id, u.email FROM users u WHERE ${w.sql} AND u.notify_product = 1 AND u.email_verified_at IS NOT NULL LIMIT 5000`,
        ...w.args,
      )
    : [];
  await logAdmin(a.id, "published announcement", title, `${label}${email ? ` · emailed ${people.length}` : ""}`);
  if (people.length)
    after(async () => {
      for (const p of people)
        await sendMail({
      unsubscribe: "product",
          userId: p.id,
          audience: "receiver",
          to: p.email,
          subject: title,
          body: [body, "", href ? `${env.appUrl}${href}` : env.appUrl, "", "You get these because product news is on in your notification settings.", "FloorTest"].join("\n"),
        }).catch(() => {});
    });
  refresh();
  await done(people.length ? `Published; emailing ${people.length} people` : "Published");
  redirect("/admin/announcements?published=1");
}

/** Moves an account to a new handle. For impersonation, the old name is released (no forwarding) and can be protected. */
export async function adminChangeHandle(userId: number, form: FormData) {
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u) return fail("Account not found");
  await cancelEmailChange(u.id);
  await logAdmin(a.id, "cancelled email change", `@${u.handle}`);
  await done("Email change cancelled");
  refresh();
}

/** Marks an incident as dealt with, so it leaves the Overview to-do list. */
export async function resolveIncident(id: number) {
  const a = await requireAdminAction();
  const r = await q.run("UPDATE incidents SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL", now(), id);
  if (r.changes) await logAdmin(a.id, "resolved incident", `#${id}`);
  await done("Marked handled");
  refresh();
}

/** Clears every open incident (of one kind, or all). For stale ones after a fix has shipped. */
export async function resolveAllIncidents(kind: string) {
  const a = await requireAdminAction();
  const r = kind
    ? await q.run("UPDATE incidents SET resolved_at = ? WHERE resolved_at IS NULL AND kind = ?", now(), kind)
    : await q.run("UPDATE incidents SET resolved_at = ? WHERE resolved_at IS NULL", now());
  await logAdmin(a.id, "resolved incidents", kind || "all", `${r.changes}`);
  await done(`Marked ${r.changes} incident${r.changes === 1 ? "" : "s"} handled`);
  refresh();
}

/** Flips a site-wide switch (sharing, bot check, open sign-up, pause uploads). Takes effect on the next request. */
export async function flipSwitch(key: SwitchKey, on: boolean) {
  const a = await requireAdminAction();
  if (!(key in SWITCHES)) return fail("Unknown switch");
  await setSwitch(key, on, a.id);
  await logAdmin(a.id, on ? "switched on" : "switched off", SWITCHES[key].label);
  await done(`${SWITCHES[key].label}: ${on ? "on" : "off"}`);
  revalidatePath("/", "layout");
}

/** Lets email go to an address again after a bounce or spam report (for example, once they've fixed their mailbox). */
export async function liftSuppression(email: string) {
  const a = await requireAdminAction();
  await q.run("DELETE FROM email_suppressions WHERE email = ?", email.trim().toLowerCase());
  await logAdmin(a.id, "lifted email block", email);
  await done(`Email to ${email} allowed again`);
  refresh();
}

/* ───────────────────────── Beta partners and feedback ───────────────────────── */

export async function savePartnerNote(email: string, form: FormData) {
  const a = await requireAdminAction();
  const key = email.trim().toLowerCase().slice(0, 200);
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
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
  const old = (await allPlans()).find((p) => p.id === id);
  if (!old) return fail("That plan no longer exists.");
  const name = String(form.get("name") || "").trim().slice(0, 40);
  const price = Math.round(Number(form.get("price")) * 100);
  const limit = Math.floor(Number(form.get("limit")));
  const blurb = String(form.get("blurb") || "").trim().slice(0, 200);
  const features = String(form.get("features") || "").split("\n").map((f) => f.trim()).filter(Boolean).slice(0, 20).map((f) => f.slice(0, 120));
  const position = Math.floor(Number(form.get("position")) || 0);
  if (!name) return fail("Give the plan a name.");
  if (!Number.isFinite(price) || price < 0 || price > 100000) return fail("Price must be between $0 and $1,000.");
  if (id === FREE_PLAN && price !== 0) return fail("Free must stay at $0.");
  if (!Number.isFinite(limit) || limit < 1 || limit > 1000000) return fail("Track limit must be at least 1.");
  const fullest = await fullestOn(id);
  if (limit < fullest) return fail(`Someone on ${old.name} already has ${fullest} active tracks, so the limit can't go below that.`);
  await q.run(
    "UPDATE plans SET name = ?, price_cents = ?, track_limit = ?, blurb = ?, features = ?, share_downloads = ?, featured = ?, position = ?, updated_at = ? WHERE id = ?",
    name, price, limit, blurb, JSON.stringify(features), form.get("share_downloads") === "on" ? 1 : 0, form.get("featured") === "on" ? 1 : 0, position, now(), id,
  );
  const changes = [
    old.price * 100 !== price && `price $${old.price} → $${price / 100}`,
    old.limit !== limit && `limit ${old.limit} → ${limit}`,
    old.name !== name && `name ${old.name} → ${name}`,
  ].filter(Boolean);
  await logAdmin(a.id, "edited plan", id, changes.join(" · ") || "wording");
  await done(`${name} saved.`);
  revalidatePath("/", "layout");
}

export async function addPlan(form: FormData) {
  const a = await requireAdminAction();
  const id = String(form.get("id") || "").trim().toLowerCase();
  const name = String(form.get("name") || "").trim().slice(0, 40);
  if (!/^[a-z][a-z0-9_]{1,23}$/.test(id)) return fail("The plan code must be 2–24 lowercase letters, numbers or _, starting with a letter.");
  if (!name) return fail("Give the plan a name.");
  if ((await allPlans()).some((p) => p.id === id)) return fail("A plan with that code already exists.");
  const position = ((await q.get<{ p: number }>("SELECT COALESCE(MAX(position), 0) AS p FROM plans"))!.p) + 1;
  // New plans start retired (hidden) so they can be filled in before anyone sees them.
  await q.run(
    "INSERT INTO plans (id, name, price_cents, track_limit, blurb, features, share_downloads, featured, position, retired_at, updated_at) VALUES (?,?,?,?,?,?,0,0,?,?,?)",
    id, name, 0, 20, "", "[]", position, now(), now(),
  );
  await logAdmin(a.id, "added plan", id, name);
  await done(`${name} added. It's hidden until you offer it.`);
  revalidatePath("/", "layout");
}

export async function setPlanOffered(id: string, offered: boolean) {
  const a = await requireAdminAction();
  if (id === FREE_PLAN && !offered) return fail("Free can't be retired: every account falls back to it.");
  await q.run("UPDATE plans SET retired_at = ?, updated_at = ? WHERE id = ?", offered ? null : now(), now(), id);
  await logAdmin(a.id, offered ? "offered plan" : "retired plan", id);
  await done(offered ? "Plan is offered again." : "Plan retired. Current users keep it; nobody new can pick it.");
  revalidatePath("/", "layout");
}

export async function deletePlan(id: string) {
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
  const def = SITE_PAGES[page];
  if (!def) return;
  const values: Record<string, string> = {};
  for (const [k, fld] of Object.entries(def.fields as Record<string, Field>)) {
    let v = String(form.get(k) ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000);
    if (fld.kind === "image" && v && !/^site\/[a-f0-9]{18}\.(jpg|png|webp)$/.test(v)) v = "";
    if (fld.kind !== "image" && !v) v = fld.start;
    values[k] = v;
  }
  const body = JSON.stringify(values);
  const publish = form.get("intent") === "publish";
  const t = now();
  await q.run(
    `INSERT INTO site_content (page, draft, published, admin_id, updated_at, published_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT (page) DO UPDATE SET draft = excluded.draft, admin_id = excluded.admin_id, updated_at = excluded.updated_at${publish ? ", published = excluded.published, published_at = excluded.published_at" : ""}`,
    page, body, publish ? body : "{}", a.id, t, publish ? t : null,
  );
  if (publish) {
    await q.run("INSERT INTO site_content_versions (page, body, admin_id, created_at) VALUES (?,?,?,?)", page, body, a.id, t);
    await logAdmin(a.id, "published site content", def.label);
    revalidatePath("/", "layout");
  }
  await done(publish ? `${def.label} published.` : `${def.label} draft saved. Preview it, then publish.`);
  refresh();
}

/** Copy an older published version back into the draft (it goes live only when published). */
export async function restoreContent(page: string, versionId: number) {
  const a = await requireAdminAction();
  if (!contentKeys.includes(page)) return;
  const v = await q.get<{ body: string }>("SELECT body FROM site_content_versions WHERE id = ? AND page = ?", versionId, page);
  if (!v) return fail("That version no longer exists.");
  await q.run("UPDATE site_content SET draft = ?, admin_id = ?, updated_at = ? WHERE page = ?", v.body, a.id, now(), page);
  await done("Version copied into the draft. Preview it, then publish.");
  refresh();
}

/** Throw the draft away: it goes back to what's published. */
export async function discardDraft(page: string) {
  const a = await requireAdminAction();
  if (!contentKeys.includes(page)) return;
  await q.run("UPDATE site_content SET draft = published, admin_id = ?, updated_at = ? WHERE page = ?", a.id, now(), page);
  await done("Draft discarded.");
  refresh();
}

const contentKeys: string[] = [...Object.keys(SITE_PAGES), ...(Object.keys(EMAILS) as EmailId[]).map(emailKey)];

/** Admin → Site content → Emails: save an email's wording as a draft, or publish it so it's used from the next send. */
export async function saveEmail(id: EmailId, form: FormData) {
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
  if (!EMAILS[id]) return;
  const t = await emailTemplate(id, "draft");
  const status = await sendMail({ userId: null, audience: "support", to: a.email, subject: `[Test] ${fillEmail(t.subject, SAMPLE_VARS)}`, body: fillEmail(t.body, SAMPLE_VARS) });
  if (status.startsWith("failed")) return fail(`Test didn't send: ${status}`);
  await done(`Test sent to ${a.email}.`);
}

/** Private admin tags on an account, used to filter Users and announcements. */
export async function saveTags(userId: number, form: FormData) {
  const a = await requireAdminAction();
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
  const a = await requireAdminAction();
  const body = String(form.get("note") || "").trim().slice(0, 2000);
  if (!body || !(await target(userId))) return fail("Write a note first.");
  await q.run("INSERT INTO account_notes (user_id, admin_id, body, created_at) VALUES (?,?,?,?)", userId, a.id, body, now());
  await done("Note added.");
  refresh();
}
