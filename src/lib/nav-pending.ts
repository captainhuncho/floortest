/**
 * Pure rules for the instant pending state on navigation (src/components/useNavPath.ts): which clicks start a page
 * change the navigation should show at once, and which path a menu should mark as current meanwhile.
 */

/** A tapped page change is shown as pending for at most this long; after that the menu goes back to the real page. */
export const PENDING_GIVE_UP_MS = 10_000;

export type PendingNav = { from: string; to: string };

export type ClickFacts = {
  button: number;
  modified: boolean;
  /** The link's resolved href (a.href), its target and whether it is a download. */
  href: string;
  target: string;
  download: boolean;
  /** The page's own origin and path (location.origin, location.pathname). */
  origin: string;
  path: string;
};

/** The path a click on a menu link is heading to, or null when it isn't an in-app page change in this tab. */
export function pendingTarget(c: ClickFacts): string | null {
  if (c.button !== 0 || c.modified || c.download) return null;
  if (c.target && c.target !== "_self") return null;
  let url: URL;
  try {
    url = new URL(c.href, c.origin);
  } catch {
    return null;
  }
  if (url.origin !== c.origin || (url.protocol !== "http:" && url.protocol !== "https:")) return null;
  // Files and endpoints aren't pages; the same page (a search or #section change) isn't a page change.
  if (url.pathname.startsWith("/api/") || url.pathname === c.path) return null;
  return url.pathname;
}

/**
 * The path a menu marks as current: the tapped page while its change is under way (the address still shows the page it
 * started from), otherwise the real one. Once the address moves on, a leftover pending change no longer counts.
 */
export function shownPath(path: string, pending: PendingNav | null): string {
  return pending && pending.from === path ? pending.to : path;
}
