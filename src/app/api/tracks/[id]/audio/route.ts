import { currentUser } from "@/lib/auth";
import { ownedTrack } from "@/lib/desk";
import { memberTrack } from "@/lib/team";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Playback for the owning receiver, or a teammate on a shared collection. With S3 storage this redirects to a short-lived signed URL,
 * so audio streams straight from the bucket (range requests included). Locally it streams from disk.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/tracks/[id]/audio">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const id = Number((await ctx.params).id);
  const t = (await ownedTrack(user.id, id)) ?? (await memberTrack(user.id, id));
  if (!t?.file_key) return new Response("Not found", { status: 404 });
  const store = await storage();

  const signed = await store.signedGetUrl(t.file_key, { contentType: t.mime, expiresIn: 3600 });
  // The signed link lasts an hour, so the browser can reuse the redirect for most of that instead of asking again on every play.
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, max-age=3000" } });

  const head = await store.head(t.file_key);
  if (!head) return new Response("Not found", { status: 404 });
  const size = head.size;
  const base = { "Content-Type": t.mime, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const { body } = await store.stream(t.file_key, { start, end });
    return new Response(body, {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const { body } = await store.stream(t.file_key);
  return new Response(body, { headers: { ...base, "Content-Length": String(size) } });
}
