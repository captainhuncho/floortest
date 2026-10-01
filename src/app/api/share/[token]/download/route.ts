import { q } from "@/lib/db";
import { shareDownloadEnabled } from "@/lib/plans";
import { safeName } from "@/lib/rekordbox";
import { shareByToken } from "@/lib/share";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/** A colleague's download of a shared track. Only while the link is live and the sharer is on a paid plan. */
export async function GET(_req: Request, ctx: RouteContext<"/api/share/[token]/download">) {
  const s = await shareByToken((await ctx.params).token);
  if (!s?.file_key || !shareDownloadEnabled(s.receiver_plan)) return new Response("Not found", { status: 404 });
  const { body, size } = await (await storage()).stream(s.file_key);
  await q.run("UPDATE track_shares SET downloads = downloads + 1 WHERE id = ?", s.id);
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
