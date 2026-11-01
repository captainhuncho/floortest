/** Admin → Users: picking many accounts at once, and the extra "Security" filter. Shared by the page and its actions. */

/** The most accounts one bulk action touches, so a slip can't suspend the whole list. */
export const BULK_MAX = 50;

/** Account ids from a form: whole positive numbers only, no repeats, at most BULK_MAX. */
export function bulkIds(raw: string[]): number[] {
  const ids = raw.filter((s) => /^\d{1,12}$/.test(s)).map(Number).filter((n) => n > 0);
  return [...new Set(ids)].slice(0, BULK_MAX);
}

/** Suspending sends an email each, so a batch stays small enough to finish inside one request. */
export const SUSPEND_MAX = 20;

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
