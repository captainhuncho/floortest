import "server-only";
import { notFound, redirect } from "next/navigation";
import { currentOpsAdmin } from "./ops";
import { now, q, type User } from "./db";
import { env } from "./env";

export const isAdminEmail = (email: string) => env.adminEmails.includes(email.toLowerCase());

/**
 * Admin pages are for ADMIN_EMAILS only, with a confirmed email (so nobody can claim an admin address by
 * signing up with it) and two-factor on, signed in through the separate ops sign-in. Anyone else gets a plain 404.
 */
export async function requireAdmin(): Promise<User> {
  // Only the ops sign-in counts (its own cookie on the ops host); a main-site session grants nothing here.
  const u = await currentOpsAdmin();
  if (!u) redirect("/ops-login");
  // Rechecked on every request, so removing an address from ADMIN_EMAILS or turning off two-factor ends access at once.
  if (!isAdminEmail(u.email) || !u.email_verified_at || !adminReady(u)) notFound();
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
