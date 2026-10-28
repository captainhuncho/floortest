/**
 * True when a browser on another site is trying to change something here: a POST, PUT, PATCH or DELETE to the API
 * started by someone else's page (cross-site request forgery). The proxy answers those 403 before any route runs.
 * Session cookies are SameSite=Lax already; this is the second lock (audit 27 Oct, rule 5).
 *
 * Browsers send Sec-Fetch-Site on every request; only our own pages ("same-origin") or the person themselves ("none")
 * pass, so another subdomain or site is refused. Older browsers without it are judged by Origin. Requests with
 * neither header aren't from a web page (the phone app's native calls, Resend's webhook, mail providers' one-click
 * unsubscribe, cron) and pass: they carry no browser cookies to abuse. Server actions get Next's own Origin check.
 * Plain module (no server-only) so the proxy can use it.
 */
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function crossSiteWrite(method: string, headers: Headers, ownOrigin: string, also = [process.env.APP_URL, process.env.OPS_URL]) {
  if (SAFE.has(method.toUpperCase())) return false;
  const site = headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = headers.get("origin");
  if (origin === null) return false;
  const ours = new Set([ownOrigin]);
  for (const u of also)
    try {
      if (u) ours.add(new URL(u).origin);
    } catch {}
  return !ours.has(origin);
}
