import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gatePassword, hasGatePass } from "@/lib/site-gate";
import { contentSecurityPolicy, makeNonce } from "@/lib/csp";
import { crossSiteWrite } from "@/lib/cross-site";

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
// Shared, read-only helpers the admin pages also use (site image previews, page-speed beacons).
const SHARED = ["/api/site-image", "/api/tap-speed"];
const under = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));
const isOps = (path: string) => under(path, OPS_PATHS);
// Open while the site is gated: the gate itself and signing in (a real sign-in then unlocks the site). Nothing about
// FloorTest is public before launch; Google's sign-in review (which needs public legal pages) waits until then.
// "/c": collection share links, which do their own checks (and say "not available" while sharing is switched off).
// "/join": team invites (sign-up from one works during the beta, like an invite code).
// "/manifest.webmanifest": the home-screen name and icons; browsers fetch it without cookies, so behind the gate it
// would get the coming-soon page and phones would lose the icon.
// "/invite": beta invite links, which let a live personal invite through to sign-up (src/app/invite/[code]/route.ts).
const GATE_OPEN = ["/coming-soon", "/login", "/forgot", "/reset", "/signed-out", "/c", "/join", "/manifest.webmanifest", "/invite"];
const notFound = (req: NextRequest, request: { headers: Headers }) => NextResponse.rewrite(new URL("/_not-found", req.url), { status: 404, request });

/**
 * Every page gets a fresh script nonce in its CSP (src/lib/csp.ts). Next reads it from the request's CSP header and puts
 * it on its own scripts, so the same policy goes on the request (for rendering) and on the response (for the browser).
 */
export function proxy(req: NextRequest) {
  const csp = contentSecurityPolicy({ nonce: makeNonce(), dev: process.env.NODE_ENV !== "production" });
  const request = { headers: new Headers(req.headers) };
  request.headers.set("Content-Security-Policy", csp);
  const res = route(req, request);
  // Verification proof files send their own, stricter policy (default-src 'none', frame-ancestors 'none'; security
  // review M2): the page policy isn't laid over it. Host separation and the cross-site check above still apply.
  if (!OWN_CSP.some((p) => p.test(req.nextUrl.pathname))) res.headers.set("Content-Security-Policy", csp);
  return res;
}

/**
 * Routes that set their own Content-Security-Policy, matched exactly: a proof file by its number only, so the upload
 * route beside it (and anything else under that path) keeps the page policy and its frame-ancestors 'none'. Each
 * also sends X-Frame-Options DENY and nosniff itself.
 */
export const OWN_CSP = [/^\/api\/admin\/verification-proofs\/\d+$/];

function route(req: NextRequest, request: { headers: Headers }) {
  const path = req.nextUrl.pathname;
  // Another site's page can't make a signed-in browser change anything here (src/lib/cross-site.ts).
  if (path.startsWith("/api/") && crossSiteWrite(req.method, req.headers, req.nextUrl.origin))
    return NextResponse.json({ error: "Open this from FloorTest." }, { status: 403 });
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
  // Everything except Next's own files and static assets, and the local-storage upload route (test copies only;
  // it checks its own signed token). Requests through the proxy keep only the first 10 MB of a body, which cut
  // bigger local uploads short; the live site uploads straight to Cloudflare and never comes through here.
  // Keep in step with PROXY_SKIPS in src/lib/csp.ts (next.config.ts gives these paths their CSP; tests/csp.test.ts).
  matcher: ["/((?!_next/|favicon|icons/|fonts/|images/|api/storage/upload|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|woff2?)$).*)"],
};
