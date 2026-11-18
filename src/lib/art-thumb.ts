import "server-only";
import { optimizeImage } from "./image-optimize";
import { storage } from "./storage";

/**
 * Small artwork for list rows and grid tiles (option 57 I; owner's app-speed rule: images at the size they're shown).
 * The art routes answer `?size=thumb` with a 192px WebP (a 96px tile at 2x), made on request from the stored artwork,
 * which upload already shrank to at most 1000px. Nothing extra is stored, so there is no second file to delete when
 * the artwork goes. Callers run their own access check first; this only resizes.
 */
export const THUMB_SIDE = 192;
/** Stored artwork is already re-encoded and small; anything bigger than this isn't resized here. */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export const wantsThumb = (req: Request) => new URL(req.url).searchParams.get("size") === "thumb";

/** The artwork at `key` as a 192px WebP, or 404. `maxAge`: how long the browser may keep it (no longer than access lasts). */
export async function thumbResponse(key: string, maxAge: number): Promise<Response> {
  const store = await storage();
  const head = await store.head(key);
  if (!head || head.size <= 0 || head.size > MAX_SOURCE_BYTES) return new Response("Not found", { status: 404 });
  const small = await optimizeImage(await store.read(key, 0, head.size - 1), THUMB_SIDE).catch(() => null);
  if (!small) return new Response("Not found", { status: 404 });
  return new Response(small, {
    headers: { "Content-Type": "image/webp", "Content-Length": String(small.byteLength), "Cache-Control": `private, max-age=${maxAge}`, "X-Content-Type-Options": "nosniff" },
  });
}
