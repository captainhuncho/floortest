import { quarantined } from "@/lib/file-digests";
import { gatedTrack } from "@/lib/link-gate";
import { safeName } from "@/lib/rekordbox";
import { allow } from "@/lib/ratelimit";
import { logLinkEvent } from "@/lib/share-links";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Download of the original through a share link: only for people allowed Listen + Download, while their session is
 * valid. Logged for the owner. It isn't the receiver's download, so the sender's receipt doesn't change.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/c/[token]/tracks/[id]/download">) {
  const { token, id } = await ctx.params;
  const g = await gatedTrack(token, Number(id));
  // Held back if the file failed its fingerprint check (src/lib/file-digests.ts).
  if (!g || g.session.permission !== "download" || (g.track.file_key && (await quarantined(g.track.file_key)))) return new Response("Not found", { status: 404 });
  if (!(await allow("link_download", `${g.link.id}:${g.session.email}`, 60, 3_600_000))) return new Response("Too many downloads. Try again later.", { status: 429 });
  const { link, session, track: t } = g;
  const { body, size } = await (await storage()).stream(t.file_key!);
  await logLinkEvent(link.id, "downloaded", { email: session.email, userId: session.user_id }, t.id);
  const name = `${safeName(`${t.artist} - ${t.title}`)}.${t.mime === "audio/wav" ? "wav" : "mp3"}`;
  return new Response(body, {
    headers: {
      "Content-Type": t.mime,
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
