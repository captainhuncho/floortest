import { NextResponse } from "next/server";
import { requireAdminQuiet } from "@/lib/admin";
import { feedFor, feedRows } from "@/lib/ops-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ops shell → live feed (src/lib/ops-feed.ts): recent activity for this viewer, read once per 30 s for everyone and
 * filtered to what they may open. Private to the viewer: the browser may keep it 30 s, nothing in between may.
 */
export async function GET() {
  const admin = await requireAdminQuiet("overview");
  if (!admin) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ items: feedFor(admin.access, await feedRows()) }, { headers: { "Cache-Control": "private, max-age=30" } });
}
