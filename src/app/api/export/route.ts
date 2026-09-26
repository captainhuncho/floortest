import { currentUser } from "@/lib/auth";
import { markDownloaded } from "@/lib/core";
import { crateZip, safeName } from "@/lib/crate";
import { db, type Collection, type Track } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/export?collection=ID&base=/Users/me/Music/FloorTest — every kept track, prepared for a set. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const cid = url.searchParams.get("collection");
  const base = (url.searchParams.get("base") || "").slice(0, 500);
  if (!base) return new Response("Choose the folder you'll unzip into.", { status: 400 });

  const collection = cid
    ? (db().prepare("SELECT * FROM collections WHERE id = ? AND user_id = ?").get(Number(cid), user.id) as Collection | undefined)
    : undefined;
  if (cid && !collection) return new Response("Not found", { status: 404 });

  const tracks = db()
    .prepare(
      `SELECT * FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND decision = 'kept' ${collection ? "AND collection_id = ?" : ""} ORDER BY decided_at`,
    )
    .all(...(collection ? [user.id, collection.id] : [user.id])) as Track[];
  if (!tracks.length) return new Response("Keep some tracks first.", { status: 400 });

  const crate = `FloorTest - ${collection?.name ?? "Kept"}`;
  const zip = crateZip(crate, base, tracks, async (t) => markDownloaded(user, t));
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName(crate).replace(/[^\x20-\x7e]/g, "_")}.zip"`,
    },
  });
}
