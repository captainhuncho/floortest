import { IMAGE_TYPES, type ImageKind } from "@/lib/images";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** Public: an image from Admin → Site content. Every upload gets a new random name, so it's cached for good. */
export async function GET(_req: Request, ctx: RouteContext<"/api/site-image/[name]">) {
  const name = (await ctx.params).name;
  const m = /^[a-f0-9]{18}\.(jpg|png|webp)$/.exec(name);
  if (!m) return new Response("Not found", { status: 404 });
  const key = `site/${name}`;
  const type = IMAGE_TYPES[m[1] as ImageKind];
  const store = await storage();
  const signed = await store.signedGetUrl(key, { contentType: type, expiresIn: 86_400 });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "public, max-age=3600" } });
  const head = await store.head(key);
  if (!head) return new Response("Not found", { status: 404 });
  const { body } = await store.stream(key);
  return new Response(body, {
    headers: { "Content-Type": type, "Content-Length": String(head.size), "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
