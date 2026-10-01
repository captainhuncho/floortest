"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signViewAs, VIEW_AS_COOKIE } from "@/lib/auth";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { logAdmin, requireAdminAction } from "@/lib/admin";
import { logEvent, now, q, type Track } from "@/lib/db";
import { storage } from "@/lib/storage";

const refresh = () => revalidatePath("/admin", "layout");
const target = async (id: number) => q.get<{ id: number; email: string; handle: string }>("SELECT id, email, handle FROM users WHERE id = ?", id);

export async function suspendAccount(userId: number, reason: string) {
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u || u.id === a.id) return;
  const why = String(reason || "").trim().slice(0, 200);
  const r = await q.tx(async (db) => {
    const r = await db.run("UPDATE users SET suspended_at = ?, suspended_reason = ? WHERE id = ? AND suspended_at IS NULL", now(), why, u.id);
    if (!r.changes) return r;
    await db.run("DELETE FROM sessions WHERE user_id = ?", u.id);
    await db.run("INSERT INTO account_actions (user_id, kind, reason, admin_id, created_at) VALUES (?,?,?,?,?)", u.id, "suspended", why, a.id, now());
    await db.run("INSERT INTO admin_log (admin_id, action, target, detail, created_at) VALUES (?,?,?,?,?)", a.id, "suspended", `@${u.handle}`, why, now());
    return r;
  });
  if (!r.changes) return;
  await sendMail({
    userId: u.id,
    audience: "support",
    to: u.email,
    subject: "Your FloorTest account is suspended",
    body: [
      "Hi,",
      "",
      "We've suspended your FloorTest account. While it's suspended you can't sign in, and your submission link is offline. Nothing has been deleted.",
      "",
      `Reason: ${why || "a breach of our Terms"}`,
      "",
      `If you think this is a mistake, you can appeal here and a person will review it: ${env.appUrl}/contact?appeal=1`,
      "",
      "FloorTest",
    ].join("\n"),
  }).catch(() => {});
  refresh();
}

export async function unsuspendAccount(userId: number) {
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u) return;
  const r = await q.tx(async (db) => {
    const r = await db.run("UPDATE users SET suspended_at = NULL, suspended_reason = '' WHERE id = ? AND suspended_at IS NOT NULL", u.id);
    if (!r.changes) return r;
    await db.run("INSERT INTO account_actions (user_id, kind, admin_id, created_at) VALUES (?,?,?,?)", u.id, "unsuspended", a.id, now());
    await db.run("INSERT INTO admin_log (admin_id, action, target, detail, created_at) VALUES (?,?,?,?,?)", a.id, "unsuspended", `@${u.handle}`, "", now());
    return r;
  });
  if (!r.changes) return;
  await sendMail({
    userId: u.id,
    audience: "support",
    to: u.email,
    subject: "Your FloorTest account is back",
    body: ["Hi,", "", `Your account is restored. You can sign in again, and your submission link is back online: ${env.appUrl}/login`, "", "FloorTest"].join("\n"),
  }).catch(() => {});
  refresh();
}

export async function signOutEverywhere(userId: number) {
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u) return;
  const r = await q.run("DELETE FROM sessions WHERE user_id = ?", u.id);
  await logAdmin(a.id, "signed out everywhere", `@${u.handle}`, `${r.changes} sessions`);
  refresh();
}

/** For a receiver locked out of their authenticator app after confirming who they are. */
export async function resetTwoFactor(userId: number) {
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u || u.id === a.id) return;
  await q.run("UPDATE users SET totp_enabled_at = NULL, totp_secret = NULL, totp_last_step = NULL, recovery_codes = '[]' WHERE id = ?", u.id);
  await q.run("DELETE FROM sessions WHERE user_id = ?", u.id);
  await logAdmin(a.id, "reset two-factor", `@${u.handle}`);
  refresh();
}

export async function setPlanFor(userId: number, plan: string) {
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u || !["free", "pro", "team"].includes(plan)) return;
  await q.run("UPDATE users SET plan = ? WHERE id = ?", plan, u.id);
  await logAdmin(a.id, "changed plan", `@${u.handle}`, plan);
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
  refresh();
}

export async function revokeInvite(code: string) {
  const a = await requireAdminAction();
  await q.run("UPDATE invites SET revoked_at = ? WHERE code = ? AND revoked_at IS NULL", now(), code);
  await logAdmin(a.id, "revoked invite", code);
  refresh();
}

/** Takes down an abusive upload: file gone from storage, track gone from the receiver's desk. */
export async function removeTrackAsAdmin(trackId: number, reason: string) {
  const a = await requireAdminAction();
  const t = await q.get<Track & { handle: string }>(
    "SELECT t.*, u.handle FROM tracks t JOIN users u ON u.id = t.user_id WHERE t.id = ? AND t.deleted_at IS NULL",
    trackId,
  );
  if (!t) return;
  await q.run("UPDATE tracks SET deleted_at = ?, file_key = NULL WHERE id = ?", now(), t.id);
  if (t.file_key) await (await storage()).delete(t.file_key).catch(() => {});
  await logEvent({ user_id: t.user_id, sender_id: t.sender_id, track_id: t.id, type: "deleted", detail: "removed by FloorTest" });
  await logAdmin(a.id, "removed track", `${t.artist} – ${t.title}`, `from @${t.handle}${reason ? ` · ${reason}` : ""}`);
  refresh();
}

/** Blocks a sender email on one receiver's link (the same as the receiver blocking them). */
export async function blockSenderAsAdmin(senderId: number) {
  const a = await requireAdminAction();
  const s = await q.get<{ id: number; email: string; user_id: number }>("SELECT id, email, user_id FROM senders WHERE id = ?", senderId);
  if (!s) return;
  await q.run("UPDATE senders SET blocked_at = COALESCE(blocked_at, ?) WHERE id = ?", now(), s.id);
  await logAdmin(a.id, "blocked sender", s.email);
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
  if (!m) return;
  const status = await sendMail({ userId: m.user_id, to: m.to_email, subject: m.subject, body: m.body, audience: m.audience });
  await logAdmin(a.id, "resent email", m.subject, status);
  refresh();
}

export async function setContactHandled(id: number, handled: boolean) {
  const a = await requireAdminAction();
  await q.run("UPDATE contact_messages SET handled_at = ? WHERE id = ?", handled ? now() : null, id);
  await logAdmin(a.id, handled ? "handled message" : "reopened message", `#${id}`);
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
    subject: "You're invited to the FloorTest beta",
    body: [
      "Hi,",
      "",
      `${inviter} invited you to the FloorTest beta: one permanent link that receives demos, a queue to review them fast, and receipts that tell senders what happened.`,
      note ? `\n"${note}"\n` : "",
      `Claim your link: ${link}`,
      "",
      `Your invite code is ${code}. It's for ${email} only and works once.`,
      "",
      "— FloorTest",
    ]
      .filter((l, i, a) => l || a[i - 1])
      .join("\n"),
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
    await q.run("INSERT INTO invites (code, max_uses, note, email, created_at, sent_at) VALUES (?,?,?,?,?,?)", code, 1, note, email, now(), now());
    await mailInvite(code, email, a.name, note);
    await logAdmin(a.id, "invited by email", email, code);
    sent++;
  }
  refresh();
  redirect(`/admin/invites?sent=${sent}&skipped=${skipped}`);
}

export async function resendInvite(code: string) {
  const a = await requireAdminAction();
  const inv = await q.get<{ email: string | null; note: string }>("SELECT email, note FROM invites WHERE code = ? AND revoked_at IS NULL", code);
  if (!inv?.email) return;
  await mailInvite(code, inv.email, a.name, inv.note);
  await q.run("UPDATE invites SET sent_at = ? WHERE code = ?", now(), code);
  await logAdmin(a.id, "resent invite", inv.email, code);
  refresh();
}

/** Waitlist → personal invite in one click. */
export async function inviteFromWaitlist(id: number) {
  const a = await requireAdminAction();
  const w = await q.get<{ email: string; invited_at: number | null; handle: string }>("SELECT email, invited_at, handle FROM waitlist WHERE id = ?", id);
  if (!w || w.invited_at) return;
  if (await q.get("SELECT 1 FROM users WHERE email = ?", w.email)) {
    await q.run("UPDATE waitlist SET invited_at = ? WHERE id = ?", now(), id);
    return refresh();
  }
  const code = newCode();
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at, sent_at) VALUES (?,?,?,?,?,?)", code, 1, "From the waitlist", w.email, now(), now());
  await mailInvite(code, w.email, a.name, "", w.handle);
  await q.run("UPDATE waitlist SET invited_at = ? WHERE id = ?", now(), id);
  await logAdmin(a.id, "invited from waitlist", w.email, code);
  refresh();
}

export async function removeFromWaitlist(id: number) {
  const a = await requireAdminAction();
  const w = await q.get<{ email: string }>("DELETE FROM waitlist WHERE id = ? RETURNING email", id);
  if (w) await logAdmin(a.id, "removed from waitlist", w.email);
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
  if (!u) return;
  await sendMail({
    userId,
    audience: "receiver",
    to: u.email,
    subject: "You're verified on FloorTest",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nYour FloorTest page now shows a ✓ Verified badge, so senders know it's really you: ${env.appUrl}/${u.handle}\n\nYou can remove the code from your bio now.\n\n— FloorTest`,
  });
  await logAdmin(a.id, "verified identity", `@${u.handle}`);
  refresh();
}

export async function rejectIdentity(userId: number, form: FormData) {
  const a = await requireAdminAction();
  const note = String(form.get("note") || "").trim().slice(0, 200);
  const u = await q.get<{ email: string; name: string; handle: string }>(
    "UPDATE users SET identity_status = 'rejected', identity_note = ? WHERE id = ? RETURNING email, name, handle",
    note,
    userId,
  );
  if (!u) return;
  await sendMail({
    userId,
    audience: "receiver",
    to: u.email,
    subject: "About your FloorTest verification",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nWe couldn't verify your profiles yet${note ? `: ${note}` : "."}\n\nYou can fix it and send it again from Settings: ${env.appUrl}/dashboard/settings#identity-h\n\n— FloorTest`,
  });
  await logAdmin(a.id, "rejected identity", `@${u.handle}`, note);
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
  refresh();
}

export async function removeProtectedName(handle: string) {
  const a = await requireAdminAction();
  await q.run("DELETE FROM protected_names WHERE handle = ?", handle);
  await logAdmin(a.id, "unprotected name", handle);
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
  if (!b) return;
  const reason = String(form.get("reason") || "").trim().slice(0, 200);
  await q.run("INSERT INTO platform_blocks (kind, value, reason, admin_id, created_at) VALUES (?,?,?,?,?) ON CONFLICT (value) DO NOTHING", b.kind, b.value, reason, a.id, now());
  await logAdmin(a.id, `blocked ${b.kind} everywhere`, b.value, reason);
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
  if (!b) return;
  await q.run("DELETE FROM platform_blocks WHERE id = ?", id);
  await logAdmin(a.id, "lifted platform block", b.value);
  refresh();
}

/** Logs a copyright claim. The track is found by its receipt token or its id. */
export async function openTakedown(form: FormData) {
  const a = await requireAdminAction();
  const claimant = String(form.get("claimant") || "").trim().slice(0, 120);
  const claimantEmail = String(form.get("claimant_email") || "").trim().toLowerCase().slice(0, 200);
  const ref = String(form.get("track") || "").trim().slice(0, 100);
  if (!claimant || !claimantEmail.includes("@") || !ref) return;
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
  refresh();
}

/** Closes a case: removes the track (and its file) or rejects the claim, with a note for the record. */
export async function decideTakedown(id: number, outcome: "removed" | "rejected", form: FormData) {
  const a = await requireAdminAction();
  const c = await q.get<{ id: number; track_id: number | null; track_label: string; status: string }>("SELECT id, track_id, track_label, status FROM takedowns WHERE id = ?", id);
  if (!c || c.status !== "open") return;
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
        "FloorTest",
      ].join("\n"),
    }).catch(() => {});
  refresh();
}
