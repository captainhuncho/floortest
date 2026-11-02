/**
 * The new Users' plain rules (admin redesign B, step 5; switch `ops_shell`): saved views, the layout, who may edit
 * which field, an account's status. No React and no server, so tests/ops-users.test.ts can run them.
 */
import { has, type Perm } from "@/lib/ops-perms";

/**
 * Saved views: a fixed list, chosen by `?view=` in the address (engineer review: the URL is the storage), each with
 * its own fixed SQL. The request only ever picks one of these; anything else is "All". `senders` stays today's
 * Senders list and is not a view here.
 */
export const VIEWS = {
  all: { label: "All", sql: "TRUE" },
  pro: { label: "Pro", sql: "u.plan = 'pro'" },
  unconfirmed: { label: "Unconfirmed", sql: "u.email_verified_at IS NULL" },
  suspended: { label: "Suspended", sql: "u.suspended_at IS NOT NULL" },
  new: { label: "New this week", sql: "u.created_at > ?" },
} as const;
export type View = keyof typeof VIEWS;
export const VIEW_KEYS = Object.keys(VIEWS) as View[];
export const WEEK_MS = 7 * 86_400_000;

export const readView = (raw: string | undefined | null): View => (raw && Object.hasOwn(VIEWS, raw) ? (raw as View) : "all");

/** The SQL and its arguments for a view (only "New this week" takes one: a week ago). */
export const viewWhere = (v: View, at: number): { sql: string; args: number[] } => ({ sql: VIEWS[v].sql, args: v === "new" ? [at - WEEK_MS] : [] });

/** Table or List, from `?layout=` (Table when missing). Phones always get the list. */
export type Layout = "table" | "list";
export const readLayout = (raw: string | undefined | null): Layout => (raw === "list" ? "list" : "table");

/** The address for the list with some parameters changed; empty values drop out, so "All" and page 1 stay short. */
export function usersHref(params: Record<string, string>, change: Record<string, string> = {}) {
  const merged = { ...params, ...change };
  if (merged.view === "all") merged.view = "";
  if (merged.layout === "table") merged.layout = "";
  if (merged.page === "1") merged.page = "";
  const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]).toString();
  return `/admin/accounts${qs ? `?${qs}` : ""}`;
}

export type Status = "Active" | "Unconfirmed" | "Suspended";
/** One word for where an account stands: suspended first, then an email not confirmed yet. */
export const statusOf = (u: { suspended: boolean; confirmed: boolean }): Status => (u.suspended ? "Suspended" : u.confirmed ? "Active" : "Unconfirmed");

/** Who is asking, as the plain permission data (the server works it out with opsAccessFor). */
export type Viewer = { super: boolean; perms: ReadonlySet<Perm> };

/**
 * What this person may change from the list, matching the actions' own checks (src/lib/ops-perms.ts ACTION_NEEDS):
 * tags, notes and suspending with Users (support); the plan with the super admin only, one account at a time (never in
 * bulk); the selection's CSV with the super admin only, like Export CSV today. A field not allowed is shown, never edited.
 */
export function editableFor(v: Viewer) {
  const support = v.super || has(v.perms, "users.support");
  return { tags: support, note: support, suspend: support, bulk: support, plan: v.super, csv: v.super };
}
export type Editable = ReturnType<typeof editableFor>;

/** Initials for the avatar: the first letters of the first two words. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** 1 … 4 5 6 … 20: the first, last and nearby pages; 0 marks a gap (as today's Users). */
export function pageList(page: number, pages: number) {
  const keep = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return keep.flatMap((p, i) => (i && p - keep[i - 1] > 1 ? [0, p] : [p]));
}
