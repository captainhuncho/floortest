import { fileAccess } from "@/lib/file-access";
import { appUser } from "@/lib/app-auth";
import { fail, unauthorized } from "@/lib/api-v1";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** Plays a track in the app: a short-lived signed link to the original (no storage keys on the phone). */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/tracks/[id]/audio">) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  const f = await fileAccess(u, "play", Number((await ctx.params).id));
  if (!f) return fail("Not found", 404);
  const store = await storage();
  const signed = await store.signedGetUrl(f.key, { contentType: f.mime, expiresIn: f.maxLinkSeconds });
  if (signed) return Response.json({ url: signed, expiresIn: f.maxLinkSeconds }, { headers: { "Cache-Control": "no-store" } });
  // Local development (no bucket): stream from disk.
  const { body } = await store.stream(f.key);
  return new Response(body, { headers: { "Content-Type": f.mime, "Cache-Control": "private, no-store" } });
}
