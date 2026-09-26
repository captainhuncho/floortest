import fs from "node:fs";
import { Readable } from "node:stream";
import { currentUser } from "@/lib/auth";
import { ownedTrack, trackPath } from "@/lib/core";

export const runtime = "nodejs";

/** Streams audio to the owning receiver with HTTP range support so seeking works. */
export async function GET(req: Request, ctx: RouteContext<"/api/tracks/[id]/audio">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const t = ownedTrack(user.id, Number((await ctx.params).id));
  const p = t && trackPath(t);
  if (!t || !p || !fs.existsSync(p)) return new Response("Not found", { status: 404 });

  const size = fs.statSync(p).size;
  const headers: Record<string, string> = {
    "Content-Type": t.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(p, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(p)) as ReadableStream, {
    headers: { ...headers, "Content-Length": String(size) },
  });
}
