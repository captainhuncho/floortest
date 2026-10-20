import { offlineFile } from "@/lib/offline";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * One kept track for the phone's offline copy, via a signed one-hour link from /api/offline/list. Checked again on every
 * download (src/lib/offline.ts): the sign-in it came from is still live, the person is still on the desk, and the track
 * is still kept, in Prepare and not deleted. The storage link lasts at most five minutes and never past the offline
 * link. Saving offline isn't a "download" for the sender's receipt, so nothing is recorded.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/offline/file/[token]">) {
  const f = await offlineFile((await ctx.params).token);
  if (!f) return new Response("Link expired", { status: 403 });
  const store = await storage();
  const signed = await store.signedGetUrl(f.fileKey, { contentType: f.mime, expiresIn: f.expiresIn });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "no-store" } });
  // Local development (no bucket): stream from disk.
  const head = await store.head(f.fileKey);
  if (!head) return new Response("Not found", { status: 404 });
  const { body } = await store.stream(f.fileKey);
  return new Response(body, { headers: { "Content-Type": f.mime, "Content-Length": String(head.size), "Cache-Control": "no-store" } });
}
