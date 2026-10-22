import { fileAccess } from "@/lib/file-access";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { attachTrackArt } from "@/lib/track-art";

export const runtime = "nodejs";

/**
 * The sender attaches optional artwork to a track they just sent (`ref` is its receipt token): see src/lib/track-art.ts.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/track-art/[ref]">) {
  const body = ((await req.json().catch(() => null)) ?? {}) as { type?: string; size?: number; done?: boolean };
  const r = await attachTrackArt((await ctx.params).ref, body);
  return NextResponse.json(r.body, { status: r.status });
}

/** The artwork, for the receiver only (`ref` is the track id). The URL carries ?v=<key>, so it can be cached. */
export async function GET(_req: Request, ctx: RouteContext<"/api/track-art/[ref]">) {
  const f = await fileAccess(await currentUser(), "art", Number((await ctx.params).ref) || 0);
  if (!f) return new Response("Not found", { status: 404 });
  const type = f.mime;
  const store = await storage();
  // Private artwork: an hour-long link, like the audio, so access that ends (a teammate removed) ends within the hour.
  // The redirect is kept for 10 minutes, well inside the link's life.
  const signed = await store.signedGetUrl(f.key, { contentType: type, expiresIn: f.maxLinkSeconds });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, max-age=600" } });
  const head = await store.head(f.key);
  if (!head) return new Response("Not found", { status: 404 });
  const { body } = await store.stream(f.key);
  return new Response(body, { headers: { "Content-Type": type, "Content-Length": String(head.size), "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
