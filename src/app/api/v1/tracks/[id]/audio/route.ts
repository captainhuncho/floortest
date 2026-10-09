import { appUser } from "@/lib/app-auth";
import { fail, unauthorized } from "@/lib/api-v1";
import { ownedTrack } from "@/lib/desk";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** Plays a track in the app: a short-lived signed link to the original (no storage keys on the phone). */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/tracks/[id]/audio">) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  const t = await ownedTrack(u.id, Number((await ctx.params).id));
  if (!t?.file_key) return fail("Not found", 404);
  const store = await storage();
  const signed = await store.signedGetUrl(t.file_key, { contentType: t.mime, expiresIn: 3600 });
  if (signed) return Response.json({ url: signed, expiresIn: 3600 }, { headers: { "Cache-Control": "no-store" } });
  // Local development (no bucket): stream from disk.
  const { body } = await store.stream(t.file_key);
  return new Response(body, { headers: { "Content-Type": t.mime, "Cache-Control": "private, no-store" } });
}
