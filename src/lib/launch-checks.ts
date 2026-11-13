import "server-only";
import { now, q, type Queryable } from "./db";
import type { SwitchKey } from "./switches";

/**
 * The owner-set checklist a site-wide switch waits on (Ops → Leave beta, Safety 13 Nov; Open sign-up added by the Desk
 * the same day, until Backend's sign-up bot fixes ship). Each item is marked done or
 * not done by the super admin; who and when go to admin_log. Nothing here edits legal text or the lawyer's status:
 * marking "renewal wording approved" only records that the owner has seen the lawyer's approval.
 */
export const LAUNCH_CHECKS = {
  card_payments: {
    label: "Card payments connected",
    hint: "The payment provider is set up and a real test charge has gone through.",
  },
  signup_bot_protection: {
    label: "Sign-up bot protection (Safety audit 13 Nov)",
    hint: "Backend's sign-up fixes from Safety's 13 Nov audit are live.",
  },
  renewal_wording: {
    label: "Lawyer's renewal wording approved",
    hint: "The lawyer has approved the renewal wording on the legal pages. Only the lawyer changes that wording.",
  },
} as const;
export type LaunchCheck = keyof typeof LAUNCH_CHECKS;

/** What each switch waits on. A switch with an item not done can't be turned on, from any admin page. */
export const SWITCH_BLOCKERS: Partial<Record<SwitchKey, readonly LaunchCheck[]>> = {
  open_signup: ["signup_bot_protection"],
  billing: ["card_payments", "renewal_wording"],
};

export type CheckState = { done: boolean; by: string | null; at: number | null };

/** Every item's state, with the handle of whoever last marked it. Not marked yet is not done. */
export async function launchChecks(db: Queryable = q): Promise<Record<LaunchCheck, CheckState>> {
  const rows = await db.all<{ key: string; done_: number; handle: string | null; updated_at: number }>(
    "SELECT c.key, c.done_, u.handle, c.updated_at FROM launch_checks c LEFT JOIN users u ON u.id = c.admin_id",
  );
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const entries = (Object.keys(LAUNCH_CHECKS) as LaunchCheck[]).map((key) => {
    const r = byKey.get(key);
    return [key, r ? { done: !!Number(r.done_), by: r.handle, at: Number(r.updated_at) } : { done: false, by: null, at: null }] as const;
  });
  return Object.fromEntries(entries) as Record<LaunchCheck, CheckState>;
}

/** The items a switch still waits on; empty when it can be turned on. */
export async function openBlockers(key: SwitchKey, db: Queryable = q): Promise<LaunchCheck[]> {
  const needs = SWITCH_BLOCKERS[key] ?? [];
  if (!needs.length) return [];
  const checks = await launchChecks(db);
  return needs.filter((c) => !checks[c].done);
}

export async function setLaunchCheck(key: LaunchCheck, done: boolean, adminId: number) {
  await q.run(
    "INSERT INTO launch_checks (key, done_, admin_id, updated_at) VALUES (?,?,?,?) ON CONFLICT (key) DO UPDATE SET done_ = excluded.done_, admin_id = excluded.admin_id, updated_at = excluded.updated_at",
    key,
    done ? 1 : 0,
    adminId,
    now(),
  );
}
