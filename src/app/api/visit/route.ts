import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { pageOf } from "@/lib/page-of";
import { allow, ipFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * In-house visit counter (owner, 5 Nov). Each call adds 1 to a daily count for its page, country, source and device;
 * nothing about the visitor is kept (no IP, cookie, account or id), and private keys never leave the browser's path
 * (pageOf). The connection is used only for the usual rate limits, which forget it within 48 hours.
 * Bounded like the speed beacon: 30 a minute and VIEWS_PER_IP_A_DAY a day per connection, VIEWS_A_DAY site-wide.
 */
export const VIEWS_PER_IP_A_DAY = 500;
const VIEWS_A_DAY = 50_000;
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|curl|wget|python|node-fetch/i;
const DEVICES = new Set(["phone", "tablet", "desktop"]);
const done = () => new NextResponse(null, { status: 204 });

/** Where the visit came from: a utm_source if the link had one, else the other site's name, else "" (typed or bookmarked). */
export function sourceOf(ref: unknown, utm: unknown, ownHost: string) {
  const tag = String(utm ?? "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 30);
  if (tag) return tag;
  try {
    const u = new URL(String(ref ?? ""));
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "").slice(0, 60);
    return host === ownHost.replace(/^www\./, "") ? "" : host;
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  if (BOT.test(req.headers.get("user-agent") ?? "")) return done();
  const ip = ipFrom(req.headers);
  if (!(await allow("visit", ip, 30, 60_000))) return done();
  if (!(await allow("visit_ip_day", ip, VIEWS_PER_IP_A_DAY, 86_400_000))) return done();
  if (!(await allow("visit_all", "all", VIEWS_A_DAY, 86_400_000))) return done();
  const body = (await req.json().catch(() => null)) as { kind?: unknown; path?: unknown; ref?: unknown; utm?: unknown; device?: unknown } | null;
  if (typeof body?.path !== "string" || !body.path.startsWith("/")) return done();
  const kind = body.kind === "visit" ? "visit" : "view";
  const page = pageOf(body.path).slice(0, 120);
  const country = (req.headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const source = kind === "visit" ? sourceOf(body.ref, body.utm, host) : "";
  const device = DEVICES.has(String(body.device)) ? String(body.device) : "";
  // A receiving link (/handle) is counted against its receiver, so Ops can see whose link gets visits.
  const handle = page === "/:link" ? body.path.split(/[/?#]/)[1]?.toLowerCase() : "";
  const owner = handle ? ((await q.get<{ id: number }>("SELECT id FROM users WHERE handle = ? AND suspended_at IS NULL", handle))?.id ?? null) : null;
  await q.run(
    `INSERT INTO visit_counts (day, kind, page, link_owner, country, source, device, n) VALUES (?,?,?,?,?,?,?,1)
     ON CONFLICT (day, kind, page, (coalesce(link_owner, 0)), country, source, device) DO UPDATE SET n = visit_counts.n + 1`,
    new Date().toISOString().slice(0, 10),
    kind,
    page,
    owner,
    /^[A-Z]{2}$/.test(country) ? country : "",
    source,
    device,
  );
  return done();
}
