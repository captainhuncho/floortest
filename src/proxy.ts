import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gatePassword, hasGatePass } from "@/lib/site-gate";
import { contentSecurityPolicy, makeNonce } from "@/lib/csp";
import { crossSiteWrite } from "@/lib/cross-site";
import { LINK_PAGE_HEADERS, NOINDEX, indexable, linkPage } from "@/lib/search-index";
import { isHiddenPath } from "@/lib/dot-paths";
import { READ_HEADER, readMarker } from "@/lib/read-marker";

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
// Open while the site is gated: the gate itself and signing in (a real sign-in then unlocks the site). Nothing about
// FloorTest is public before launch; Google's sign-in review (which needs public legal pages) waits until then.
// "/c": collection share links, which do their own checks (and say "not available" while sharing is switched off).
// "/join": team invites (sign-up from one works during the beta, like an invite code).
// "/manifest.webmanifest": the home-screen name and icons; browsers fetch it without cookies, so behind the gate it
// would get the coming-soon page and phones would lose the icon.
// "/invite": beta invite links, which let a live personal invite through to sign-up (src/app/invite/[code]/route.ts).
// "/.well-known": security.txt, so anyone reporting a problem finds the contact before launch too.
const GATE_OPEN = ["/coming-soon", "/login", "/forgot", "/reset", "/signed-out", "/c", "/join", "/manifest.webmanifest", "/invite", "/.well-known"];
const notFound = (req: NextRequest, request: { headers: Headers }) => NextResponse.rewrite(new URL("/_not-found", req.url), { status: 404, request });

/**
 * Every page gets a fresh script nonce in its CSP (src/lib/csp.ts). Next reads it from the request's CSP header and puts
 * it on its own scripts, so the same policy goes on the request (for rendering) and on the response (for the browser).
 */
export function proxy(req: NextRequest) {
  const csp = contentSecurityPolicy({ nonce: makeNonce(), dev: process.env.NODE_ENV !== "production" });
  const request = { headers: new Headers(req.headers) };
  request.headers.set("Content-Security-Policy", csp);
  // The read mark (src/lib/read-marker.ts): any client copy is deleted, and only a GET or HEAD gets the real one.
  // auth.ts treats a request without it as one that can change something.
  request.headers.delete(READ_HEADER);
  if (req.method === "GET" || req.method === "HEAD") request.headers.set(READ_HEADER, readMarker());
  const res = route(req, request);
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

function route(req: NextRequest, request: { headers: Headers }) {
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
  // Coming-soon gate: every page on the main site shows the coming-soon page until the password is entered.
  // The API (webhooks, health, cron) and ops (its own sign-in) stay reachable.
  if (gatePassword() && !onOpsHost && !path.startsWith("/api/") && !under(path, GATE_OPEN) && !hasGatePass(req.cookies.get(GATE_COOKIE)?.value)) {
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
