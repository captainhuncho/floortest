import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateAdmits } from "@/lib/site-gate";
import { readSessionToken } from "@/lib/sessions";
import { contentSecurityPolicy, makeNonce } from "@/lib/csp";
import { crossSiteWrite } from "@/lib/cross-site";
import { LINK_PAGE_HEADERS, NOINDEX, indexable, linkPage } from "@/lib/search-index";
import { isHiddenPath } from "@/lib/dot-paths";
import { READ_HEADER, readMarker } from "@/lib/read-marker";
import { RESERVED_HANDLES } from "@/lib/plans";

/**
 * Keeps the admin area and the main site apart by host. With OPS_URL set (production): the ops host serves only the
 * admin area and its sign-in, and the main site answers "not found" for both. Without it (local, previews): no change.
 */
const OPS_HOST = (() => {
  try {
    return process.env.VERCEL_ENV === "preview" || !process.env.OPS_URL ? null : new URL(process.env.OPS_URL).host;
  } catch {
    return null;
  }
})();

const OPS_PATHS = ["/admin", "/api/admin", "/ops-login"];
// Shared, read-only helpers the admin pages also use (site image previews, page-speed and visit beacons), and /.well-known
// (security.txt), public on every host.
const SHARED = ["/api/site-image", "/api/tap-speed", "/api/visit", "/.well-known"];
const under = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));
const isOps = (path: string) => under(path, OPS_PATHS);
// Open while the site is gated: the gate itself and signing in (a real sign-in then unlocks the site). Before launch
// only these, receiving links, receipts, sender history, the legal pages and Contact are public (owner, 10 Nov); the home page,
// pricing, sign-up and the desk stay behind the password.
// "/c": collection share links, which do their own checks (and say "not available" while sharing is switched off).
// "/join": team invites (sign-up from one works during the beta, like an invite code).
// "/manifest.webmanifest": the home-screen name and icons; browsers fetch it without cookies, so behind the gate it
// would get the coming-soon page and phones would lose the icon.
// "/invite": beta invite links, which let a live personal invite through to sign-up (src/app/invite/[code]/route.ts).
// "/.well-known": security.txt, so anyone reporting a problem finds the contact before launch too.
// "/sent", "/receipt": a sender's history and receipts, so people sending to an open receiving link (below) can follow
// what happened to their track (owner, 10 Nov).
// The legal pages and Contact: a sender can read what the send form asks them to agree to and report a link (owner,
// 10 Nov, "open the legal pages too"). Only who can open them changes; the wording stays as it is. These open only the
// page itself (a trailing slash too), never a path under it, so a later child route such as /security/<something>
// stays behind the password (Safety follow-up to #503).
const GATE_OPEN = ["/coming-soon", "/login", "/forgot", "/reset", "/signed-out", "/c", "/join", "/manifest.webmanifest", "/invite", "/.well-known", "/sent", "/receipt"];
const GATE_OPEN_EXACT = ["/terms", "/privacy", "/cookies", "/contact", "/privacy-choices", "/subprocessors", "/content-rules", "/takedown", "/law-enforcement", "/security"];
const exactly = (path: string, list: string[]) => list.some((p) => path === p || path === `${p}/`);

/**
 * A receiving link (floortest.app/<link name>) is open while the site is gated, so anyone with the link can send before
 * launch (owner, 10 Nov). Only one path part shaped like a link name (2–30 letters, numbers, - or _, src/lib/accounts.ts)
 * that isn't one of the site's own pages (RESERVED_HANDLES lists every top-level page; tests/visit-counter.test.ts keeps
 * it complete), so /pricing, /signup and the rest stay behind the password. An unknown name gets the link's own "Nothing
 * on this link" page.
 */
const LINK_NAME_PATH = /^\/([A-Za-z0-9][A-Za-z0-9_-]{1,29})\/?$/;
export function receivingLinkPath(path: string) {
  const m = LINK_NAME_PATH.exec(path);
  return !!m && !RESERVED_HANDLES.has(m[1].toLowerCase());
}
const notFound = (req: NextRequest, request: { headers: Headers }) => NextResponse.rewrite(new URL("/_not-found", req.url), { status: 404, request });

/**
 * Every page gets a fresh script nonce in its CSP (src/lib/csp.ts). Next reads it from the request's CSP header and puts
 * it on its own scripts, so the same policy goes on the request (for rendering) and on the response (for the browser).
 */
export async function proxy(req: NextRequest) {
  const csp = contentSecurityPolicy({ nonce: makeNonce(), dev: process.env.NODE_ENV !== "production" });
  const request = { headers: new Headers(req.headers) };
  request.headers.set("Content-Security-Policy", csp);
  // The read mark (src/lib/read-marker.ts): any client copy is deleted, and only a GET or HEAD gets the real one.
  // auth.ts treats a request without it as one that can change something.
  request.headers.delete(READ_HEADER);
  if (req.method === "GET" || req.method === "HEAD") request.headers.set(READ_HEADER, readMarker());
  const res = await route(req, request);
  // Verification proof files send their own, stricter policy (default-src 'none', frame-ancestors 'none'; security
  // review M2): the page policy isn't laid over it. Host separation and the cross-site check above still apply.
  if (!OWN_CSP.some((p) => p.test(req.nextUrl.pathname))) res.headers.set("Content-Security-Policy", csp);
  // Search engines list only the public pages; any other answer (pages, API, redirects, not-found) says noindex.
  if (!indexable(req.nextUrl.pathname)) res.headers.set("X-Robots-Tag", NOINDEX);
  // Private link pages: not kept by browsers or caches, and the address isn't passed on to other sites (search-index.ts).
  if (linkPage(req.nextUrl.pathname)) for (const [k, v] of Object.entries(LINK_PAGE_HEADERS)) res.headers.set(k, v);
  return res;
}

/** The view-as cookie's name (src/lib/auth.ts VIEW_AS_COOKIE; kept here so the proxy needs no server code). */
export const VIEW_AS_COOKIE_NAME = "floortest_view_as";

/** A request that could change something while an admin is viewing someone's desk. */
export function viewWrite(method: string, viewing: boolean) {
  return viewing && method !== "GET" && method !== "HEAD";
}

/**
 * Routes that set their own Content-Security-Policy, matched exactly: a proof file by its number only, so the upload
 * route beside it (and anything else under that path) keeps the page policy and its frame-ancestors 'none'. Each
 * also sends X-Frame-Options DENY and nosniff itself.
 */
export const OWN_CSP = [/^\/api\/admin\/verification-proofs\/\d+$/];

async function route(req: NextRequest, request: { headers: Headers }) {
  const path = req.nextUrl.pathname;
  // Hidden files (/.env, /.git, any part starting with "."): "not found" on every host, before anything else (src/lib/dot-paths.ts).
  if (isHiddenPath(path)) return notFound(req, request);
  // Another site's page can't make a signed-in browser change anything here (src/lib/cross-site.ts).
  if (path.startsWith("/api/") && crossSiteWrite(req.method, req.headers, req.nextUrl.origin))
    return NextResponse.json({ error: "Open this from FloorTest." }, { status: 403 });
  // An admin's "view as" is read-only for every way in (Safety audit M1): Next.js runs a server action from a plain form
  // post without its Next-Action header, so the header check in auth.ts isn't enough on its own. Any change request that
  // carries the view cookie (sent only to /dashboard) goes back to the read-only desk without running. Starting and
  // ending a view are GETs.
  if (viewWrite(req.method, req.cookies.has(VIEW_AS_COOKIE_NAME))) return NextResponse.redirect(new URL("/dashboard/floor?readonly=1", req.url), 303);
  const onOpsHost = !!OPS_HOST && req.headers.get("host") === OPS_HOST;
  // Coming-soon gate: every page on the main site except the open ones above shows the coming-soon page until the
  // password is entered. The API (webhooks, health, cron) and ops (its own sign-in) stay reachable. Whether the site is
  // locked at all (SITE_PASSWORD and the site_lock switch) is asked last, so open paths never read the switch. A live
  // session also gets through, so signed-in people keep working when the site re-locks (owner, 14 Nov).
  if (!onOpsHost && !path.startsWith("/api/") && !under(path, GATE_OPEN) && !exactly(path, GATE_OPEN_EXACT) && !receivingLinkPath(path) && !(await gateAdmits(req.cookies.get(GATE_COOKIE)?.value, readSessionToken(req.cookies, process.env.NODE_ENV === "production")))) {
    // Invite emails link to /signup?invite=CODE: the invite route checks the code and opens the gate for a live one.
    const invite = path === "/signup" ? req.nextUrl.searchParams.get("invite") : null;
    if (invite) {
      const url = req.nextUrl.clone();
      url.pathname = `/invite/${encodeURIComponent(invite)}`;
      return NextResponse.redirect(url);
    }
    const url = req.nextUrl.clone();
    url.pathname = "/coming-soon";
    url.search = `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
    return NextResponse.rewrite(url, { request });
  }
  if (!OPS_HOST) return NextResponse.next({ request });
  const onOps = req.headers.get("host") === OPS_HOST;
  if (onOps) {
    if (path === "/") return NextResponse.redirect(new URL("/admin", req.url));
    return isOps(path) || under(path, SHARED) ? NextResponse.next({ request }) : notFound(req, request);
  }
  return isOps(path) ? notFound(req, request) : NextResponse.next({ request });
}

export const config = {
  // Everything except Next's own files, the static folders (public/auth, brand, icons, motion, tour, fonts, images), the
  // few root metadata files and the local-storage upload route (test copies only; it checks its own signed token).
  // Pages and actions always go through, whatever the path ends in: a skipped /dashboard/x.png once ran a server action
  // unchecked (Safety audit M1). Requests through the proxy keep only the first 10 MB of a body, which cut bigger local
  // uploads short; the live site uploads straight to Cloudflare and never comes through here.
  // A path with a hidden part (/.env.txt, /icons/.x.png, or with %2E for the dot, %2F/%5C for a separator) is never
  // skipped, so the hidden-file rule above always sees it.
  // Keep in step with PROXY_SKIPS in src/lib/csp.ts (next.config.ts gives these paths their CSP; tests/csp.test.ts).
  matcher: ["/((?!(?!(?:.*(?:/|%2[fF]|%5[cC]))?(?:\\.|%2[eE]))(?:_next/|(?:auth|brand|icons|motion|tour|fonts|images)/|api/storage/upload(?:/|$)|(?:favicon\\.ico|apple-icon\\.png|icon\\.svg|opengraph-image\\.png|opengraph-image\\.alt\\.txt|robots\\.txt|sitemap\\.xml)$)).*)"],
};
