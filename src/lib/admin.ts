import "server-only";
import { notFound, redirect } from "next/navigation";
import { currentOpsAdmin } from "./ops";
import type { User } from "./db";
import { env } from "./env";
import { flash } from "./flash";
import type { Need } from "./ops-perms";
import { can, opsAccessFor, type OpsAccess } from "./ops-access";
import { logAdmin } from "./admin-log";
export { logAdmin } from "./admin-log";
export { can, homeFor, opsAccessFor, type OpsAccess } from "./ops-access";

export const isAdminEmail = (email: string) => env.adminEmails.includes(email.toLowerCase());

/**
 * Ops pages are for the super admin and active ops team members, with a confirmed email (so nobody can claim an
 * address by signing up with it) and two-factor on, signed in through the separate ops sign-in. Anyone else gets a
 * plain 404. With `need`, someone without that permission is sent to the "no access" page instead.
 */
export async function requireAdmin(need?: Need): Promise<User & { access: OpsAccess }> {
  // Only the ops sign-in counts (its own cookie on the ops host); a main-site session grants nothing here.
  const u = await currentOpsAdmin();
  if (!u) redirect("/ops-login");
  // Rechecked on every request, so removing someone (or turning off their two-factor) ends access at once.
  const access = await opsAccessFor(u);
  if (!access || !u.email_verified_at || !adminReady(u)) notFound();
  if (need && !can(access, need)) redirect("/admin/no-access");
  return Object.assign(u, { access });
}

export const adminReady = (u: User) => !!u.totp_enabled_at;

/** Every admin action names what it needs (see ACTION_NEEDS); the build check makes sure none is missed. */
export async function requireAdminAction(need: Need): Promise<User & { access: OpsAccess }> {
  const u = await requireAdmin();
  if (!adminReady(u)) throw new Error("Turn on two-factor sign-in to use admin actions.");
  if (!can(u.access, need)) {
    await logAdmin(u.id, "denied", need);
    await flash("You don't have permission to do that.", "error");
    redirect("/admin/no-access");
  }
  return u;
}

