import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { IMAGE_TYPES as TYPES, type ImageKind } from "@/lib/images";
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
  const [user, t] = await Promise.all([
    currentUser(),
    q.get<{ user_id: number; art_key: string | null }>("SELECT user_id, art_key FROM tracks WHERE id = ? AND deleted_at IS NULL", Number((await ctx.params).ref) || 0),
  ]);
  if (!t?.art_key || !user || user.id !== t.user_id) return new Response("Not found", { status: 404 });
  const type = TYPES[t.art_key.split(".").pop() as ImageKind] ?? "application/octet-stream";
  const store = await storage();
  // Private artwork: an hour-long link, like the audio, so access that ends (a teammate removed) ends within the hour.
  // The redirect is kept for 10 minutes, well inside the link's life.
  const signed = await store.signedGetUrl(t.art_key, { contentType: type, expiresIn: 3600 });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, max-age=600" } });
  const head = await store.head(t.art_key);
  if (!head) return new Response("Not found", { status: 404 });
  const { body } = await store.stream(t.art_key);
  return new Response(body, { headers: { "Content-Type": type, "Content-Length": String(head.size), "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
