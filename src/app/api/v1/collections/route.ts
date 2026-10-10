import { appUser } from "@/lib/app-auth";
import { json, unauthorized } from "@/lib/api-v1";
import { collectionsFor, isClosed } from "@/lib/desk";

export const runtime = "nodejs";

/** Your collections (callouts), with how many tracks each holds, still waiting, and kept. */
export async function GET(req: Request) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  const rows = await collectionsFor(u.id);
  return json({
    collections: rows.map((c) => ({
      id: c.id, name: c.name, active: c.id === u.active_collection_id, closed: isClosed(c), closesAt: c.closes_at,
      tracks: Number(c.count), waiting: Number(c.needs_review), kept: Number(c.kept),
    })),
  });
}
