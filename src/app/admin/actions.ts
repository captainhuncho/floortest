"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
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
