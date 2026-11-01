import { loadRows } from "@/app/dashboard/rows";
import { appUser } from "@/lib/app-auth";
import { fail, json, unauthorized } from "@/lib/api-v1";
import { asPerson, q } from "@/lib/db";

export const runtime = "nodejs";

/** One of your collections and its tracks, newest first. Audio plays from /api/v1/tracks/:id/audio. */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/collections/[id]">) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  const id = Number((await ctx.params).id) || 0;
  // Both reads run under the per-person rules (B8) as well as the desk filter.
  const c = await asPerson(u.actor_id, () => q.get<{ id: number; name: string }>("SELECT id, name FROM collections WHERE id = ? AND user_id = ?", id, u.id));
  if (!c) return fail("Not found", 404);
  const rows = await loadRows(u.id, { collectionId: c.id, actor: u.actor_id });
  return json({ collection: c, tracks: rows.map((r) => ({ ...r, audio: `/api/v1/tracks/${r.id}/audio` })) });
}
