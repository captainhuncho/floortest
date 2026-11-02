/**
 * What search engines may list. Only the site's own public pages: everything else (receivers' links, receipts, sender
 * links, collections, invites, account and email links, the API) answers with X-Robots-Tag noindex from the proxy, so a
 * private link that someone posts publicly is still never listed. A new page is private until it's added here.
 */
export const PUBLIC_PAGES = ["/", "/pricing", "/trust", "/contact", "/terms", "/privacy", "/cookies", "/privacy-choices", "/takedown", "/content-rules", "/subprocessors", "/security", "/law-enforcement", "/licenses"];

export const NOINDEX = "noindex, nofollow, noarchive";

/** True only for a listed public page (a trailing slash counts as the same page). */
export function indexable(path: string) {
  const p = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return PUBLIC_PAGES.includes(p);
}

/**
 * Paths crawlers are asked not to open at all: signed-in areas, the API, sign-in forms, and email links that act on a
 * visit (newsletter confirm and unsubscribe, reopen alerts). Every other private path stays crawlable on purpose: a
 * crawler that may not open a page can't see its noindex and may list the bare link, token included.
 */
export const CRAWL_BLOCKED = ["/dashboard", "/admin", "/api/", "/login", "/signup", "/forgot", "/newsletter/", "/sent/reopen/"];

/**
 * Pages opened from a private link that show something about the person it was sent to (owner, 2 Nov): a receipt, the
 * sender's history, a team invite, the two email confirmations, and a password reset (hub review of #375, 2 Nov). Browsers and shared caches don't keep them
 * (`Cache-Control: private, no-store`), and when someone follows a link away from one, other sites aren't told the
 * address (`Referrer-Policy: same-origin`). Not `no-referrer`: with it browsers send `Origin: null` on the page's own
 * form posts, and Next refuses server actions that don't come from this site.
 */
export const LINK_PAGES = /^\/(receipt|sent|join|verify-email|confirm-email|reset)\/[^/]+\/?$/;
export const LINK_PAGE_HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "same-origin" } as const;

/** True for one of the private link pages above (not the routes beside them, like /join/<token>/login). */
export function linkPage(path: string) {
  return LINK_PAGES.test(path);
}
