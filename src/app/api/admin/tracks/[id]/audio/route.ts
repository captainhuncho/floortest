import { logAdmin, requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** Same 5-minute life as desk playback (file-access.ts): a link that leaks stops working soon. */
const LINK_SECONDS = 300;

/**
 * Admin → Moderation → play: staff with the moderation permission can listen to a track to check a report
 * (owner, 1 Nov 2026). Every start of a play is written to the admin log with the track and whose desk it is on.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/admin/tracks/[id]/audio">) {
  const admin = await requireAdmin("moderation");
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1) return new Response("Not found", { status: 404 });
  const t = await q.get<{ id: number; title: string; artist: string; file_key: string | null; mime: string; handle: string }>(
    "SELECT t.id, t.title, t.artist, t.file_key, t.mime, u.handle FROM tracks t JOIN users u ON u.id = t.user_id WHERE t.id = ? AND t.deleted_at IS NULL",
    id,
  );
  if (!t?.file_key) return new Response("Not found", { status: 404 });

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  // A play starts once; the browser's follow-up range requests for the same play aren't logged again.
  if (!range || range[1] === "0") await logAdmin(admin.id, "played track", `${t.artist} – ${t.title}`, `#${t.id} on @${t.handle}`);

  const store = await storage();
  const signed = await store.signedGetUrl(t.file_key, { contentType: t.mime, expiresIn: LINK_SECONDS });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, no-store" } });

  const head = await store.head(t.file_key);
  if (!head) return new Response("Not found", { status: 404 });
  const size = head.size;
  const base = { "Content-Type": t.mime, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" };
  if (range) {
    const start = Math.max(0, range[1] ? Number(range[1]) : size - Number(range[2]));
    const end = Math.min(size - 1, range[1] && range[2] ? Number(range[2]) : size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const { body } = await store.stream(t.file_key, { start, end });
    return new Response(body, { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const { body } = await store.stream(t.file_key);
  return new Response(body, { headers: { ...base, "Content-Length": String(size) } });
}
