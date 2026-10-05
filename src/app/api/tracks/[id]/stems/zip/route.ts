import { currentUser } from "@/lib/auth";
import { ownedTrack } from "@/lib/desk";
import { featureOn } from "@/lib/features";
import { safeName } from "@/lib/crate";
import { stemsFor } from "@/lib/stems";
import { storage } from "@/lib/storage";
import { zipStream } from "@/lib/zip";

export const runtime = "nodejs";
export const maxDuration = 300;

/** All of a track's stems in one ZIP, built on the fly. Only ever contains checked audio. */
export async function GET(_req: Request, ctx: RouteContext<"/api/tracks/[id]/stems/zip">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await featureOn("stems", user))) return new Response("Not found", { status: 404 });
  const t = await ownedTrack(user.id, Number((await ctx.params).id));
  const stems = t ? await stemsFor(t.id) : [];
  if (!t || !stems.length) return new Response("Not found", { status: 404 });
  const folder = safeName(`${t.artist} - ${t.title} (stems)`);
  const seen = new Set<string>();
  const entries = stems.map((s) => {
    let name = safeName(s.name);
    while (seen.has(name)) name = `${name.replace(/(\.\w+)?$/, "")} (2)${s.name.match(/\.\w+$/)?.[0] ?? ""}`;
    seen.add(name);
    return { name: `${folder}/${name}`, open: async () => (await (await storage()).stream(s.file_key)).body };
  });
  const file = `${folder}.zip`;
  return new Response(zipStream(entries), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${file.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
