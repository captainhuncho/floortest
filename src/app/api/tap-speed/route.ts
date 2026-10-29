import { NextResponse } from "next/server";
import { now, q } from "@/lib/db";
import { RESERVED_HANDLES } from "@/lib/plans";
import { allow, ipFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Collapses a path to its page, never the person or item: /receipt/abc123 → /receipt/:token, /dashboard/collections/42 → …/:id,
 * and anyone's receiving link (/djkwame) → /:link.
 */
function pageOf(path: string) {
  const parts = path.split("?")[0].split("/").filter(Boolean).slice(0, 4);
  if (parts.length === 1 && !RESERVED_HANDLES.has(parts[0].toLowerCase())) return "/:link";
  const out = parts.map((p, i) =>
    /^\d+$/.test(p) ? ":id" : i > 0 && ["t", "s", "v", "receipt", "share", "sent", "reset", "verify-email", "unsubscribe"].includes(parts[i - 1]) ? ":token" : p.length > 40 ? ":token" : p,
  );
  return "/" + out.join("/");
}

const clean = (s: unknown, n: number) => String(s ?? "").replace(/[^\w\s\-.:/'’&]/g, "").slice(0, n);

/**
 * Anyone can send timings, so the table is bounded: 10 beacons a minute per connection, BEACONS_PER_IP_A_DAY a day per
 * connection, and site-wide at most BEACONS_A_DAY (each up to 30 rows, kept 30 days), far above real use. Over any of
 * them, beacons are dropped quietly. The per-connection share means one address can't use up the day's cap and leave
 * Admin's speed page blank for everyone else.
 */
const BEACONS_A_DAY = 2000;
export const BEACONS_PER_IP_A_DAY = 200;

export async function POST(req: Request) {
  const ip = ipFrom(req.headers);
  if (!(await allow("tap_speed", ip, 10, 60_000))) return new NextResponse(null, { status: 204 });
  if (!(await allow("tap_speed_ip_day", ip, BEACONS_PER_IP_A_DAY, 86_400_000))) return new NextResponse(null, { status: 204 });
  if (!(await allow("tap_speed_all", "all", BEACONS_A_DAY, 86_400_000))) return new NextResponse(null, { status: 204 });
  const body = (await req.json().catch(() => null)) as { device?: unknown; browser?: unknown; items?: unknown } | null;
  const items = Array.isArray(body?.items) ? body.items.slice(0, 30) : [];
  const device = ["phone", "tablet", "desktop"].includes(String(body?.device)) ? String(body?.device) : "";
  const browser = ["Safari", "Chrome", "Firefox", "Edge", "Other"].includes(String(body?.browser)) ? String(body?.browser) : "";
  const t = now();
  // Up to 30 timings per beacon, saved in one insert rather than one per row.
  const rows: unknown[][] = [];
  for (const it of items as { kind?: unknown; path?: unknown; target?: unknown; ms?: unknown }[]) {
    const kind = it?.kind === "nav" || it?.kind === "load" ? it.kind : "tap";
    const ms = Math.round(Number(it?.ms));
    if (!Number.isFinite(ms) || ms < 0 || ms > (kind === "tap" ? 10_000 : 60_000) || typeof it?.path !== "string") continue;
    rows.push([t, kind, pageOf(it.path).slice(0, 120), clean(it.target, 30), ms, device, browser]);
  }
  if (rows.length)
    await q.run(`INSERT INTO tap_timings (created_at, kind, path, target, ms, device, browser) VALUES ${rows.map(() => "(?,?,?,?,?,?,?)").join(",")}`, ...rows.flat());
  return new NextResponse(null, { status: 204 });
}
