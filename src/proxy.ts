import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gatePassword, hasGatePass } from "@/lib/site-gate";

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
const GATE_OPEN = ["/coming-soon", "/login", "/forgot", "/reset", "/signed-out", "/c", "/join"];
const notFound = (req: NextRequest) => NextResponse.rewrite(new URL("/_not-found", req.url), { status: 404 });

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const onOpsHost = !!OPS_HOST && req.headers.get("host") === OPS_HOST;
  // Coming-soon gate: every page on the main site shows the coming-soon page until the password is entered.
  // The API (webhooks, health, cron) and ops (its own sign-in) stay reachable.
  if (gatePassword() && !onOpsHost && !path.startsWith("/api/") && !under(path, GATE_OPEN) && !hasGatePass(req.cookies.get(GATE_COOKIE)?.value)) {
    const url = req.nextUrl.clone();
    url.pathname = "/coming-soon";
    url.search = `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
    return NextResponse.rewrite(url);
  }
  if (!OPS_HOST) return NextResponse.next();
  const onOps = req.headers.get("host") === OPS_HOST;
  if (onOps) {
    if (path === "/") return NextResponse.redirect(new URL("/admin", req.url));
    return isOps(path) || under(path, SHARED) ? NextResponse.next() : notFound(req);
  }
  return isOps(path) ? notFound(req) : NextResponse.next();
}

export const config = {
  // Everything except Next's own files and static assets.
  matcher: ["/((?!_next/|favicon|icons/|fonts/|images/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|woff2?)$).*)"],
};
