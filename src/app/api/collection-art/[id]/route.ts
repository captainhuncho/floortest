import { discardFiles } from "@/lib/deletion";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { currentDeskForChange, currentUser, viewingAs } from "@/lib/auth";
import { q, type Collection } from "@/lib/db";
import { activeCollection } from "@/lib/desk";
import { readCover, serveCover, settleFile, storeCover } from "@/lib/cover-art";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";

const collectionOf = async (raw: string) => q.get<Pick<Collection, "id" | "user_id" | "name" | "art_key">>("SELECT id, user_id, name, art_key FROM collections WHERE id = ?", Number(raw) || 0);

/** The owner's collection, for changing its artwork (never during a read-only support "view as", never from a lost team desk). */
async function ownCollection(raw: string) {
  if (await viewingAs()) return null;
  const user = await currentDeskForChange();
  if (user instanceof Response) return user;
  const c = user ? await collectionOf(raw) : undefined;
  return user && c && c.user_id === user.id ? { user, c } : null;
}

/** Upload or replace a collection's artwork (JPG, PNG or WebP, up to 8 MB, checked by its bytes). */
export async function POST(req: Request, ctx: RouteContext<"/api/collection-art/[id]">) {
  const own = await ownCollection((await ctx.params).id);
  if (own instanceof Response) return own;
  if (!own) return NextResponse.json({ error: "That collection isn't on your desk any more. Reload the page." }, { status: 404 });
  if (!(await allow("cover_art", String(own.user.actor_id), 60, 3_600_000))) return NextResponse.json({ error: "Too many images at once. Try again shortly." }, { status: 429 });
  const opt = await readCover(req);
  if (opt instanceof Response) return opt;
  const key = await storeCover(`collection-art/${own.c.id}`, "collection_art", opt);
  await q.run("UPDATE collections SET art_key = ? WHERE id = ?", key, own.c.id);
  await settleFile(key);
  await discardFiles([own.c.art_key], "collection artwork replaced");
  await audit(own.user.id, "collection_updated", `${own.c.name}: artwork`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/collection-art/[id]">) {
  const own = await ownCollection((await ctx.params).id);
  if (own instanceof Response) return own;
  if (!own) return NextResponse.json({ error: "That collection isn't on your desk any more. Reload the page." }, { status: 404 });
  await q.run("UPDATE collections SET art_key = NULL WHERE id = ?", own.c.id);
  await discardFiles([own.c.art_key], "collection artwork removed");
  await audit(own.user.id, "collection_updated", `${own.c.name}: artwork removed`);
  return NextResponse.json({ ok: true });
}

/**
 * The artwork: for its owner, or for anyone while the collection is the one their link is receiving into (it shows
 * on the public link page). The URL carries ?v=<key>, so responses can be cached hard.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/collection-art/[id]">) {
  const c = await collectionOf((await ctx.params).id);
  if (!c?.art_key) return new Response("Not found", { status: 404 });
  const owner = await q.get<{ active_collection_id: number | null }>("SELECT active_collection_id FROM users WHERE id = ? AND suspended_at IS NULL", c.user_id);
  const viewer = await currentUser();
  const isPublic = !!owner && (await activeCollection(owner))?.id === c.id;
  if (!isPublic && viewer?.id !== c.user_id) return new Response("Not found", { status: 404 });
  return serveCover(c.art_key);
}
