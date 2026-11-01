import { loadRows } from "@/app/dashboard/rows";
import { appUser } from "@/lib/app-auth";
import { json, unauthorized } from "@/lib/api-v1";

export const runtime = "nodejs";

/** Prepare for set: every kept track still in your set, most recently kept first. The app saves these for offline play. */
export async function GET(req: Request) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  const rows = await loadRows(u.id, { inSet: true, actor: u.actor_id });
  return json({ tracks: rows.map((r) => ({ ...r, audio: `/api/v1/tracks/${r.id}/audio` })) });
}
