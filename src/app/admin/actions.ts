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
  await q.run("UPDATE users SET suspended_at = ?, suspended_reason = ? WHERE id = ? AND suspended_at IS NULL", now(), String(reason || "").slice(0, 200), u.id);
  await q.run("DELETE FROM sessions WHERE user_id = ?", u.id);
  await logAdmin(a.id, "suspended", `@${u.handle}`, reason);
  refresh();
}

export async function unsuspendAccount(userId: number) {
  const a = await requireAdminAction();
  const u = await target(userId);
  if (!u) return;
  await q.run("UPDATE users SET suspended_at = NULL, suspended_reason = '' WHERE id = ?", u.id);
  await logAdmin(a.id, "unsuspended", `@${u.handle}`);
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

async function mailInvite(code: string, email: string, inviter: string, note: string) {
  const link = `${env.appUrl}/signup?invite=${encodeURIComponent(code)}`;
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
