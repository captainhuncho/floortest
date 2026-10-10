import { q } from "@/lib/db";
import { readOfflineToken } from "@/lib/offline";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * One kept track for the phone's offline copy, via a signed one-hour link from /api/offline/list. Checked again here:
 * the track must still be this receiver's, kept, in Prepare and not deleted. Saving offline isn't a "download" for the
 * sender's receipt, so nothing is recorded.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/offline/file/[token]">) {
  const tok = readOfflineToken((await ctx.params).token);
  if (!tok) return new Response("Link expired", { status: 403 });
  const t = await q.get<{ file_key: string | null; mime: string }>(
    "SELECT file_key, mime FROM tracks WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND decision = 'kept' AND set_cleared_at IS NULL",
    tok.trackId,
    tok.userId,
  );
  if (!t?.file_key) return new Response("Not found", { status: 404 });
  const store = await storage();
  const signed = await store.signedGetUrl(t.file_key, { contentType: t.mime, expiresIn: 3600 });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "no-store" } });
  // Local development (no bucket): stream from disk.
  const head = await store.head(t.file_key);
  if (!head) return new Response("Not found", { status: 404 });
  const { body } = await store.stream(t.file_key);
  return new Response(body, { headers: { "Content-Type": t.mime, "Content-Length": String(head.size), "Cache-Control": "no-store" } });
}
