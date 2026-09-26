import fs from "node:fs";
import path from "node:path";
import { userByHandle } from "@/lib/core";
import { COVER_DIR } from "@/lib/db";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/** Public: the cover is shown on the receiver's public page. */
export async function GET(_req: Request, ctx: RouteContext<"/api/cover/[handle]">) {
  const u = userByHandle((await ctx.params).handle);
  const p = u?.cover_file && path.join(COVER_DIR, path.basename(u.cover_file));
  if (!p || !fs.existsSync(p)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(p), {
    headers: {
      "Content-Type": TYPES[path.extname(p)] ?? "application/octet-stream",
      // File names change on every upload, but the URL doesn't, so keep caching short.
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
