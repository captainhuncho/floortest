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

export async function POST(req: Request) {
  if (!(await allow("tap_speed", ipFrom(req.headers), 60, 60_000))) return new NextResponse(null, { status: 204 });
  const body = (await req.json().catch(() => null)) as { device?: unknown; browser?: unknown; items?: unknown } | null;
  const items = Array.isArray(body?.items) ? body.items.slice(0, 30) : [];
  const device = ["phone", "tablet", "desktop"].includes(String(body?.device)) ? String(body?.device) : "";
  const browser = ["Safari", "Chrome", "Firefox", "Edge", "Other"].includes(String(body?.browser)) ? String(body?.browser) : "";
  const t = now();
  for (const it of items as { kind?: unknown; path?: unknown; target?: unknown; ms?: unknown }[]) {
    const kind = it?.kind === "nav" || it?.kind === "load" ? it.kind : "tap";
    const ms = Math.round(Number(it?.ms));
    if (!Number.isFinite(ms) || ms < 0 || ms > (kind === "tap" ? 10_000 : 60_000) || typeof it?.path !== "string") continue;
    await q.run(
      "INSERT INTO tap_timings (created_at, kind, path, target, ms, device, browser) VALUES (?,?,?,?,?,?,?)",
      t,
      kind,
      pageOf(it.path).slice(0, 120),
      clean(it.target, 30),
      ms,
      device,
      browser,
    );
  }
  return new NextResponse(null, { status: 204 });
}
