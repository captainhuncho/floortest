import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { safeName } from "@/lib/rekordbox";
import { logShareAccess, shareByToken } from "@/lib/share";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * A colleague's download of a shared track: signed-in accounts only, while the link is live, and only if the
 * receiver was on a paid plan (and allowed sharing) when the track was sent. Upgrading later doesn't change that.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/share/[token]/download">) {
  const user = await currentUser();
  if (!user) return new Response("Sign in to download", { status: 401 });
  const s = await shareByToken((await ctx.params).token);
  if (!s?.file_key || !s.share_download) return new Response("Not found", { status: 404 });
  const { body, size } = await (await storage()).stream(s.file_key);
  await q.run("UPDATE track_shares SET downloads = downloads + 1 WHERE id = ?", s.id);
  if (user.id !== s.receiver_id) await logShareAccess(s.id, user.id, "download");
  const name = `${safeName(s.artist_title)}.${s.mime === "audio/wav" ? "wav" : "mp3"}`;
  return new Response(body, {
    headers: {
      "Content-Type": s.mime,
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
