import { userByHandle } from "@/lib/desk";
import { quarantined } from "@/lib/file-digests";
import { hiddenBehindGate } from "@/lib/gate-hidden";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Public: the cover on a receiver's link. The URL carries ?v=<key> and each upload gets a new key,
 * so responses can be cached hard.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/cover/[handle]">) {
  // Before launch, only visitors past the gate (or signed in) can tell which handles exist.
  const u = (await hiddenBehindGate(req)) ? undefined : await userByHandle((await ctx.params).handle);
  // A cover that failed its fingerprint check is held back, like every other stored file.
  if (!u?.cover_key || (await quarantined(u.cover_key))) return new Response("Not found", { status: 404 });
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
