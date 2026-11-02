/** Admin → Users: picking many accounts at once, and the extra "Security" filter. Shared by the page and its actions. */

/** The most accounts one bulk action touches, so a slip can't suspend the whole list. */
export const BULK_MAX = 50;

/**
 * Account ids from a form: whole positive numbers only, no repeats. Null when more than BULK_MAX were sent: the
 * screen never sends that many, so the request is refused rather than quietly cut to the first BULK_MAX.
 */
export function bulkIds(raw: string[]): number[] | null {
  const ids = [...new Set(raw.filter((s) => /^\d{1,12}$/.test(s)).map(Number).filter((n) => n > 0))];
  return ids.length > BULK_MAX ? null : ids;
}

/** Suspending sends an email each, so a batch stays small enough to finish inside one request. */
export const SUSPEND_MAX = 20;

/** The plans staff can set on one account (the record page and the new Users). Never changed in bulk (owner, 1 Nov). */
export const ADMIN_PLANS = ["free", "pro", "team"] as const;

/** Users are listed this many to a page. */
export const PAGE_SIZE = 50;

/** Page number from the query string: 1 when missing or not a number. */
export const readPage = (raw: string | undefined) => Math.max(1, Math.min(10_000, Math.floor(Number(raw)) || 1));

export const SECURITY = { "": "Any", on: "Two-factor on", off: "Password only" } as const;
export type Security = keyof typeof SECURITY;

/** Anything but "on" or "off" means no filter. */
export const readSecurity = (raw: string | undefined): Security => (raw === "on" || raw === "off" ? raw : "");

/** The fixed SQL for each choice; the request only ever picks one of these. */
export const securityWhere = (s: Security) => (s === "on" ? "u.totp_enabled_at IS NOT NULL" : s === "off" ? "u.totp_enabled_at IS NULL" : "TRUE");
