import "server-only";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "./auth";
import { now, q, type User } from "./db";
import { env } from "./env";

export const isAdminEmail = (email: string) => env.adminEmails.includes(email.toLowerCase());

/**
 * Admin pages are for ADMIN_EMAILS only, with a confirmed email (so nobody can claim an admin address by
 * signing up with it) and two-factor on, even just to look. Anyone else gets a plain 404 so the admin
 * area doesn't advertise itself; an admin address missing either is sent to Settings to fix it.
 */
export async function requireAdmin(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!isAdminEmail(u.email)) notFound();
  // An admin address only counts once the email is confirmed and two-factor is on; until then, no admin data.
  if (!u.email_verified_at || !adminReady(u)) redirect("/dashboard/settings/security");
  return u;
}

export const adminReady = (u: User) => !!u.totp_enabled_at;

/** Admin actions additionally refuse to run without two-factor. */
export async function requireAdminAction(): Promise<User> {
  const u = await requireAdmin();
  if (!adminReady(u)) throw new Error("Turn on two-factor sign-in to use admin actions.");
  return u;
}

export async function logAdmin(adminId: number, action: string, target = "", detail = "") {
  await q.run("INSERT INTO admin_log (admin_id, action, target, detail, created_at) VALUES (?,?,?,?,?)", adminId, action, target, detail.slice(0, 300), now());
}
