import "server-only";
import { cache } from "react";
import { q, type User } from "./db";
import { env } from "./env";
import { has, PAGE_NEEDS, parsePerms, PERMS, ROLE_PERMS, type Need, type Perm, type Role } from "./ops-perms";

/** Who someone is in ops. Kept apart from admin.ts (no Next imports) so the rules can be tested on their own. */
const isSuperEmail = (email: string) => env.adminEmails.includes(email.toLowerCase());

export type OpsAccess = { super: true; role: "super"; perms: ReadonlySet<Perm> } | { super: false; role: Role; perms: ReadonlySet<Perm> };

/**
 * Who this person is in ops: the super admin (ADMIN_EMAILS, can't be locked out), an active ops team member with
 * their role's permissions plus or minus their own, or nobody. Memoised per request.
 */
export const opsAccessFor = cache(async (u: Pick<User, "id" | "email">): Promise<OpsAccess | null> => {
  if (isSuperEmail(u.email)) return { super: true, role: "super", perms: new Set(Object.keys(PERMS) as Perm[]) };
  const m = await q.get<{ role: Role; grant_perms: string; deny_perms: string; disabled_at: number | null }>(
    "SELECT role, grant_perms, deny_perms, disabled_at FROM ops_members WHERE user_id = ?",
    u.id,
  );
  if (!m || m.disabled_at || !(m.role in ROLE_PERMS)) return null;
  const deny = new Set(parsePerms(m.deny_perms));
  return { super: false, role: m.role, perms: new Set([...ROLE_PERMS[m.role], ...parsePerms(m.grant_perms)].filter((p) => !deny.has(p))) };
});

export const can = (access: OpsAccess, need: Need) => access.super || (need !== "super" && has(access.perms, need));

/** The first page someone can open: Overview for most, otherwise their first permitted area. */
export const homeFor = (access: OpsAccess) => Object.keys(PAGE_NEEDS).find((p) => can(access, PAGE_NEEDS[p])) ?? "/admin/no-access";


/**
 * Why `caller` may not suspend someone with `target` ops access, or null if they may. Suspension also ends ops access,
 * so it follows the Team page's rule: only the super admin changes ops staff, and the super admin can't be locked out.
 */
/**
 * Why `caller` may not tag or note an account, or null if they may (Safety, 4 Nov; the same rank rule as suspendRefusal).
 * The super admin's account only by that super admin; any other ops staff member only by the super admin.
 */
export function annotateRefusal(caller: { id: number; access: OpsAccess }, target: { id: number; super: boolean; staff: boolean }): string | null {
  if (target.super) return caller.access.super && caller.id === target.id ? null : "Only the super admin can tag or note their own account.";
  if (target.staff && !caller.access.super) return "Only the super admin can tag or note ops staff.";
  return null;
}

/** Which of these accounts are the super admin or ops staff, in one query (for annotateRefusal). */
export async function staffOf(ids: number[]) {
  if (!ids.length) return new Map<number, { super: boolean; staff: boolean }>();
  const rows = await q.all<{ id: number; email: string; staff: boolean }>(
    `SELECT u.id, u.email, (m.user_id IS NOT NULL AND m.disabled_at IS NULL) AS staff FROM users u LEFT JOIN ops_members m ON m.user_id = u.id WHERE u.id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  return new Map(rows.map((r) => [Number(r.id), { super: isSuperEmail(r.email), staff: !!r.staff }]));
}

export function suspendRefusal(caller: OpsAccess, target: OpsAccess | null): string | null {
  if (target?.super) return "The super admin can't be suspended.";
  if (target && !caller.super) return "Only the super admin can suspend ops staff.";
  return null;
}
