import { redactUrl } from "./redact-url";

/** Everything the visit beacon needs from the browser, passed in so the rules can be tested without one. */
export type BeaconInput = {
  consent: string;
  path: string;
  landing: boolean;
  referrer: string;
  search: string;
  host: string;
  device: string;
};

/**
 * What the visit counter sends, or null to send nothing (owner, 5 Nov). Nothing at all unless the visitor chose Accept
 * on the cookie banner. The path loses any private key (redactUrl) and never carries its query. The referrer is cut
 * to the other site's name before it leaves the browser, and dropped when it's our own site: a same-origin referrer
 * holds the previous page's full path, which may be /reset/<key> or /receipt/<key> (Safety review of #435, 5 Nov).
 */
export function visitBeacon(i: BeaconInput): string | null {
  if (i.consent !== "accepted" || !i.path) return null;
  return JSON.stringify({
    kind: i.landing ? "visit" : "view",
    path: redactUrl(i.path.split("?")[0]),
    device: i.device,
    ...(i.landing ? { ref: referrerHost(i.referrer, i.host), utm: new URLSearchParams(i.search).get("utm_source") ?? "" } : {}),
  });
}

/** The referring site's name only (no path or query), or "" for none or our own site. */
export function referrerHost(referrer: string, ownHost: string) {
  try {
    const u = new URL(referrer);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host === ownHost.toLowerCase().split(":")[0].replace(/^www\./, "") ? "" : host.slice(0, 60);
  } catch {
    return "";
  }
}
