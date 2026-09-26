import { userByHandle } from "@/lib/core";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Public: the cover on a receiver's link. The URL carries ?v=<key> and each upload gets a new key,
 * so responses can be cached hard.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/cover/[handle]">) {
  const u = await userByHandle((await ctx.params).handle);
  if (!u?.cover_key) return new Response("Not found", { status: 404 });
  const store = await storage();
  const type = TYPES[u.cover_key.split(".").pop() ?? ""] ?? "application/octet-stream";
  const signed = await store.signedGetUrl(u.cover_key, { contentType: type, expiresIn: 86_400 });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "public, max-age=3600" } });
  const head = await store.head(u.cover_key);
  if (!head) return new Response("Not found", { status: 404 });
  const { body } = await store.stream(u.cover_key);
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(head.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
