import "server-only";
import { env } from "./env";

/**
 * True when a request came from FloorTest itself (a link or button on our pages) or was typed into the address bar,
 * not from another site. Session cookies are SameSite=Lax, so a link on any site still sends them on a top-level GET;
 * routes whose GET records something the sender sees (Downloaded) check this first.
 *
 * Browsers send Sec-Fetch-Site; older ones that don't fall back to the Referer's origin, and with neither (some
 * privacy settings strip both) the request is allowed, as before, so nobody is locked out of their own downloads.
 */
export function fromThisSite(headers: Headers) {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const referer = headers.get("referer");
  if (!referer) return true;
  try {
    const origin = new URL(referer).origin;
    return [env.appUrl, env.opsUrl].some((u) => new URL(u).origin === origin);
  } catch {
    return false;
  }
}

export const OTHER_SITE = "Open this from your FloorTest desk.";
