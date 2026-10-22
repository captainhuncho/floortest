import { currentUser } from "@/lib/auth";
import { ownedTrack } from "@/lib/desk";
import { featureOn } from "@/lib/features";
import { q } from "@/lib/db";
import type { Stem } from "@/lib/stems";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

const attachment = (name: string) => `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

/** One stem, for the track's owner only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/tracks/[id]/stems/[stemId]">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await featureOn("stems", user))) return new Response("Not found", { status: 404 });
  const { id, stemId } = await ctx.params;
  const t = await ownedTrack(user, Number(id));
  const stem = t && (await q.get<Stem>("SELECT * FROM stems WHERE id = ? AND track_id = ?", Number(stemId), t.id));
  if (!stem) return new Response("Not found", { status: 404 });
  const { body, size } = await (await storage()).stream(stem.file_key);
  return new Response(body, {
    headers: { "Content-Type": stem.mime, "Content-Length": String(size), "Content-Disposition": attachment(stem.name), "Cache-Control": "private, no-store" },
  });
}
