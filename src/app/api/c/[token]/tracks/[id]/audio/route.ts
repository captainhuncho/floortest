import { q } from "@/lib/db";
import { gatedTrack } from "@/lib/link-gate";
import { logLinkEvent } from "@/lib/share-links";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Playback through a collection share link. Always streamed through the app (never a storage link), with the session
 * checked on every request, so it stops the moment the link is reset or revoked or the person is removed.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/c/[token]/tracks/[id]/audio">) {
  const { token, id } = await ctx.params;
  const g = await gatedTrack(token, Number(id));
  if (!g) return new Response("Not found", { status: 404 });
  const { link, session, track: t } = g;
  const store = await storage();
  const head = await store.head(t.file_key!);
  if (!head) return new Response("Not found", { status: 404 });
  const size = head.size;
  const base = { "Content-Type": t.mime, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "Content-Disposition": "inline" };
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  // "Played": recorded once per person and track (playback starting from the beginning), not on every chunk.
  if ((!range || range[1] === "0") && !(await q.get("SELECT 1 FROM link_events WHERE link_id = ? AND kind = 'listened' AND email = ? AND track_id = ?", link.id, session.email, t.id)))
    await logLinkEvent(link.id, "listened", { email: session.email, userId: session.user_id }, t.id);
  if (range) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const { body } = await store.stream(t.file_key!, { start, end });
    return new Response(body, { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const { body } = await store.stream(t.file_key!);
  return new Response(body, { headers: { ...base, "Content-Length": String(size) } });
}
