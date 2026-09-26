import { currentUser } from "@/lib/auth";
import { audit, trackLabel } from "@/lib/audit";
import { markDownloaded, ownedTrack } from "@/lib/core";
import { crateFileName } from "@/lib/crate";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The original file, streamed through the app (not redirected) so "Downloaded" is recorded only
 * once the last byte has gone out, per the published definition.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/tracks/[id]/download">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const t = await ownedTrack(user.id, Number((await ctx.params).id));
  if (!t?.file_key) return new Response("Not found", { status: 404 });
  const { body, size } = await (await storage()).stream(t.file_key);

  const counted = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      async flush() {
        await markDownloaded(user, t).catch((e) => console.error("[download] mark failed", e));
        await audit(user.id, "downloaded", trackLabel(t), t.id);
      },
    }),
  );
  const name = crateFileName(t);
  return new Response(counted, {
    headers: {
      "Content-Type": t.mime,
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
