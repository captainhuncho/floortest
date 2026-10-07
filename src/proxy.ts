import { NextResponse, type NextRequest } from "next/server";

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
const notFound = (req: NextRequest) => NextResponse.rewrite(new URL("/_not-found", req.url), { status: 404 });

export function proxy(req: NextRequest) {
  if (!OPS_HOST) return NextResponse.next();
  const path = req.nextUrl.pathname;
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
