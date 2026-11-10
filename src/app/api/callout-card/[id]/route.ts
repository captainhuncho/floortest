import { NextResponse } from "next/server";
import { currentUser, viewingAs } from "@/lib/auth";
import { cardFields } from "@/lib/callout-card/fields";
import { fitPhoto, renderCard, type CardFormat } from "@/lib/callout-card/render";
import { q } from "@/lib/db";
import { calloutBlock, capacity } from "@/lib/desk";
import { quarantined } from "@/lib/file-digests";
import { allow } from "@/lib/ratelimit";
import { gatePassword } from "@/lib/site-gate";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

const FORMATS: readonly string[] = ["story", "square"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const STORAGE_MS = 5_000;
const CARDS_PER_MINUTE = 20;
const MINUTE = 60_000;
const notFound = () => new Response("Not found", { status: 404 });

const COLLECTION_FIELDS = "id, name, art_key, closes_at, full_at, bpm_min, bpm_max, brief_wanted, brief_note, genres";
type CardCollection = {
  id: number; name: string; art_key: string | null; closes_at: number | null; full_at: number | null;
  bpm_min: number | null; bpm_max: number | null; brief_wanted: string | null; brief_note: string | null; genres: string;
};

/** A stored photo ready for the card, or null if it's held back, missing, slow or unusable. */
async function photoFrom(key: string | null) {
  if (!key) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (await quarantined(key)) return null;
    const store = await storage();
    const load = async () => {
      const head = await store.head(key);
      if (!head || head.size > MAX_PHOTO_BYTES) return null;
      return store.read(key, 0, head.size - 1);
    };
    const bytes = await Promise.race([load(), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), STORAGE_MS); })]);
    return bytes ? await fitPhoto(bytes) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The share image for a callout that's open right now: for its owner only. */
export async function GET(req: Request, ctx: RouteContext<"/api/callout-card/[id]">) {
  if (await viewingAs()) return notFound();
  const user = await currentUser();
  if (!user) return new Response("Sign in", { status: 401 });
  if (user.role !== "owner") return notFound();
  if (!user.email_verified_at) return new Response("Confirm your email first", { status: 403 });
  const raw = (await ctx.params).id;
  if (!/^\d{1,15}$/.test(raw)) return notFound();
  const format = new URL(req.url).searchParams.get("format") ?? "";
  if (!FORMATS.includes(format)) return new Response("Unknown format", { status: 400 });
  if (!(await allow("callout-card", String(user.id), CARDS_PER_MINUTE, MINUTE))) return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });

  const collection = await q.get<CardCollection>(`SELECT ${COLLECTION_FIELDS} FROM collections WHERE id = ? AND user_id = ?`, Number(raw), user.id);
  if (!collection) return notFound();
  const account = await q.get<{ suspended_at: number | null }>("SELECT suspended_at FROM users WHERE id = ?", user.id);
  const live = !account?.suspended_at && !gatePassword() && user.active_collection_id === collection.id;
  if (!live) return NextResponse.json({ reason: "unavailable" }, { status: 409 });
  const block = calloutBlock(user, collection, (await capacity(user)).full);
  if (block) return NextResponse.json({ reason: block }, { status: 409 });

  const photo = (await photoFrom(collection.art_key)) ?? (await photoFrom(user.cover_key));
  let png: Buffer;
  try {
    png = await renderCard(format as CardFormat, cardFields(user, collection), photo);
  } catch (error) {
    console.error("callout card render failed", error);
    return new Response("Couldn't make the card", { status: 500 });
  }
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="floortest-callout-${format}.png"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
