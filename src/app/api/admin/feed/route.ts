import { NextResponse } from "next/server";
import { requireAdminQuiet } from "@/lib/admin";
import { feedFor, feedRows } from "@/lib/ops-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ops shell → live feed (src/lib/ops-feed.ts): recent activity for this viewer, read once per 30 s for everyone and
 * filtered to what they may open. Never stored, by the browser or anything in between: a browser cache is keyed by
 * address, not by who is signed in, so on a shared device one person's feed must never show to the next (Safety, 1 Nov).
 * The server's 30 s read already saves the work.
 */
export async function GET() {
  const admin = await requireAdminQuiet("overview");
  if (!admin) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ items: feedFor(admin.access, await feedRows()) }, { headers: { "Cache-Control": "private, no-store" } });
}
