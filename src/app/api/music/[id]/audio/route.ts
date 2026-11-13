import { currentUser } from "@/lib/auth";
import { libraryFileAccess } from "@/lib/file-access";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Playback of one of the desk's own tracks (My music), for anyone working the desk. Same as desk tracks
 * (src/app/api/tracks/[id]/audio): a short signed link with S3 storage, streamed from disk locally.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/music/[id]/audio">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const f = await libraryFileAccess(user, Number((await ctx.params).id));
  if (!f) return new Response("Not found", { status: 404 });
  const store = await storage();

  const signed = await store.signedGetUrl(f.key, { contentType: f.mime, expiresIn: f.maxLinkSeconds });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, no-store" } });

  const head = await store.head(f.key);
  if (!head) return new Response("Not found", { status: 404 });
  const size = head.size;
  const base = { "Content-Type": f.mime, "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const { body } = await store.stream(f.key, { start, end });
    return new Response(body, { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const { body } = await store.stream(f.key);
  return new Response(body, { headers: { ...base, "Content-Length": String(size) } });
}
