import { fileAccess } from "@/lib/file-access";
import { currentUser } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { attachment } from "@/lib/content-disposition";

export const runtime = "nodejs";
export const maxDuration = 300;


/** One stem, for the track's owner only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/tracks/[id]/stems/[stemId]">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id, stemId } = await ctx.params;
  const f = await fileAccess(user, "stem", Number(id), Number(stemId));
  if (!f) return new Response("Not found", { status: 404 });
  const { body, size } = await (await storage()).stream(f.key);
  return new Response(body, {
    headers: { "Content-Type": f.mime, "Content-Length": String(size), "Content-Disposition": attachment(f.name ?? "stem"), "Cache-Control": "private, no-store" },
  });
}
