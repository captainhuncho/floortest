import { NextResponse } from "next/server";
import { isOpsHost } from "@/lib/consent";
import { q } from "@/lib/db";
import { env } from "@/lib/env";
import { knownPage, pageOf } from "@/lib/page-of";
import { allow, ipFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * In-house visit counter (owner, 5 Nov), fed only after the visitor chooses Accept on the cookie banner
 * (src/components/Visits.tsx). Each call adds 1 to a daily count for its page, country, source and device; nothing about
 * the visitor is kept (no IP, cookie, account or id), and private keys never reach the table (pageOf). The connection is
 * used only for the usual rate limits, which forget it within 48 hours.
 *
 * Anyone can call it, so every value is bounded (Safety review of #435, 5 Nov):
 * - only our own pages can send it: Sec-Fetch-Site must say same-origin (or, from a browser that doesn't send it, Origin
 *   must be this host), the body must be JSON of at most MAX_BODY bytes, and the ops host is refused, so another site
 *   can't make its visitors' browsers inflate the counts;
 * - junk is dropped before it takes a rate-limit slot, so it can't use up the site-wide cap;
 * - 30 a minute and VIEWS_PER_IP_A_DAY a day per connection, VIEWS_A_DAY site-wide;
 * - a page outside FloorTest's own routes counts as /other, and each day keeps at most PAGES_A_DAY pages and
 *   SOURCES_A_DAY sources; past that, new ones count as /other and other. Two beacons at the same moment can each see
 *   room for one more, so a day may end a few over; that's accepted (no lock on a counter).
 */
export const VIEWS_PER_IP_A_DAY = 500;
export const VIEWS_A_DAY = 50_000;
export const PAGES_A_DAY = 300;
export const SOURCES_A_DAY = 200;
const MAX_BODY = 2048;
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|curl|wget|python|node-fetch/i;
const DEVICES = new Set(["phone", "tablet", "desktop"]);
const done = () => new NextResponse(null, { status: 204 });

/**
 * Where the visit came from: a utm_source if the link had one, else the other site's name, else "" (typed, bookmarked
 * or our own site). The browser sends only a site name (src/lib/visit-beacon.ts); anything else is refused here too.
 */
export function sourceOf(ref: unknown, utm: unknown, ownHost: string) {
  const tag = String(utm ?? "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 30);
  if (tag) return tag;
  const host = String(ref ?? "").toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host.length > 60) return "";
  return host === ownHost.replace(/^www\./, "") ? "" : host;
}

/** The rate-limit key for a connection: an IPv6 address by its /64 (one home or phone), an IPv4 address as it is. */
export function connectionKey(raw: string) {
  // An IPv4 address written the IPv6 way (::ffff:1.2.3.4) is still that IPv4 address.
  const ip = raw.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${full.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/** The body, read only up to MAX_BODY bytes whether or not a Content-Length was sent (chunked bodies too); null if longer. */
async function readCapped(req: Request) {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** True only for a request our own pages sent: same-origin by Sec-Fetch-Site, or by Origin when that header is missing. */
function fromOurPages(req: Request, host: string) {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  try {
    return new URL(req.headers.get("origin") ?? "").host.toLowerCase() === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const fullHost = (req.headers.get("host") ?? "").toLowerCase();
  if (!fromOurPages(req, fullHost) || isOpsHost(fullHost, env.appUrl, env.opsUrl)) return done();
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return done();
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return done();
  if (BOT.test(req.headers.get("user-agent") ?? "")) return done();
  const text = await readCapped(req).catch(() => null);
  if (text === null) return done();
  let body: { kind?: unknown; path?: unknown; ref?: unknown; utm?: unknown; device?: unknown } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    return done();
  }
  if (typeof body?.path !== "string" || !body.path.startsWith("/")) return done();
  // Only well-formed beacons from our pages reach the limits, so junk can't spend them.
  const ip = connectionKey(ipFrom(req.headers));
  if (!(await allow("visit", ip, 30, 60_000))) return done();
  if (!(await allow("visit_ip_day", ip, VIEWS_PER_IP_A_DAY, 86_400_000))) return done();
  if (!(await allow("visit_all", "all", VIEWS_A_DAY, 86_400_000))) return done();
  const kind = body.kind === "visit" ? "visit" : "view";
  // The browser already sends pages reduced (src/lib/visit-beacon.ts); /other is one of them, never someone's link.
  let page = body.path === "/other" ? "/other" : knownPage(pageOf(body.path));
  const country = (req.headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  const host = fullHost.split(":")[0];
  let source = kind === "visit" ? sourceOf(body.ref, body.utm, host) : "";
  const device = DEVICES.has(String(body.device)) ? String(body.device) : "";
  // A receiving link (/handle) is counted against its receiver, so Ops can see whose link gets visits.
  const handle = page === "/:link" ? body.path.split(/[/?#]/)[1]?.toLowerCase() : "";
  const owner = handle ? ((await q.get<{ id: number }>("SELECT id FROM users WHERE handle = ? AND suspended_at IS NULL", handle))?.id ?? null) : null;
  const day = new Date().toISOString().slice(0, 10);
  // A day's list of pages and sources can't grow without end: once full, new values join /other and other.
  const seen = await q.get<{ pages: number; has_page: boolean; sources: number; has_source: boolean }>(
    `SELECT (SELECT COUNT(DISTINCT page) FROM visit_counts WHERE day = ?)::int AS pages,
            EXISTS (SELECT 1 FROM visit_counts WHERE day = ? AND page = ?) AS has_page,
            (SELECT COUNT(DISTINCT source) FROM visit_counts WHERE day = ?)::int AS sources,
            EXISTS (SELECT 1 FROM visit_counts WHERE day = ? AND source = ?) AS has_source`,
    day, day, page, day, day, source,
  );
  if (seen && !seen.has_page && seen.pages >= PAGES_A_DAY) page = "/other";
  if (seen && source && !seen.has_source && seen.sources >= SOURCES_A_DAY) source = "other";
  await q.run(
    `INSERT INTO visit_counts (day, kind, page, link_owner, country, source, device, n) VALUES (?,?,?,?,?,?,?,1)
     ON CONFLICT (day, kind, page, (coalesce(link_owner, 0)), country, source, device) DO UPDATE SET n = visit_counts.n + 1`,
    day,
    kind,
    page,
    owner,
    /^[A-Z]{2}$/.test(country) ? country : "",
    source,
    device,
  );
  return done();
}
