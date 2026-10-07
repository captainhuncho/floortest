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

