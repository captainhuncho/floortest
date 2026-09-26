import fs from "node:fs";
import { Readable } from "node:stream";
import { currentUser } from "@/lib/auth";
import { markDownloaded, ownedTrack, trackPath } from "@/lib/core";
import { crateFileName } from "@/lib/crate";

export const runtime = "nodejs";

/** Streams the original file. "Downloaded" is recorded only once the last byte has been read. */
export async function GET(_req: Request, ctx: RouteContext<"/api/tracks/[id]/download">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const t = ownedTrack(user.id, Number((await ctx.params).id));
  const p = t && trackPath(t);
  if (!t || !p || !fs.existsSync(p)) return new Response("Not found", { status: 404 });

  const stream = fs.createReadStream(p);
  stream.on("end", () => void markDownloaded(user, t).catch(console.error));
  const name = crateFileName(t);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": t.mime,
      "Content-Length": String(fs.statSync(p).size),
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
