import { q } from "@/lib/db";
import { shareByToken } from "@/lib/share";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Audio for a colleague's listen-only link. Always streamed through the app (never a signed bucket URL),
 * so it stops working the moment the link expires or is switched off.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/share/[token]/audio">) {
  const s = await shareByToken((await ctx.params).token);
  if (!s?.file_key) return new Response("Not found", { status: 404 });
  const store = await storage();
  const head = await store.head(s.file_key);
  if (!head) return new Response("Not found", { status: 404 });
  const size = head.size;
  const base = { "Content-Type": s.mime, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "Content-Disposition": "inline" };
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  // Count a play when playback starts from the beginning.
  if (!range || range[1] === "0") await q.run("UPDATE track_shares SET plays = plays + 1 WHERE id = ?", s.id);
  if (range) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const { body } = await store.stream(s.file_key, { start, end });
    return new Response(body, { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const { body } = await store.stream(s.file_key);
  return new Response(body, { headers: { ...base, "Content-Length": String(size) } });
}
