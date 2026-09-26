import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { markDownloaded } from "@/lib/core";
import { crateZip, safeName } from "@/lib/crate";
import { q, type Collection, type Track } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

/** GET /api/export?collection=ID&base=/Users/me/Music/FloorTest — every kept track, prepared for a set. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const cid = url.searchParams.get("collection");
  const base = (url.searchParams.get("base") || "").slice(0, 500);
  if (!base) return new Response("Choose the folder you'll unzip into.", { status: 400 });

  const collection = cid ? await q.get<Collection>("SELECT * FROM collections WHERE id = ? AND user_id = ?", Number(cid), user.id) : undefined;
  if (cid && !collection) return new Response("Not found", { status: 404 });

  const tracks = await q.all<Track>(
    `SELECT * FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND file_key IS NOT NULL AND decision = 'kept'
     ${collection ? "AND collection_id = ?" : ""} ORDER BY decided_at`,
    ...(collection ? [user.id, collection.id] : [user.id]),
  );
  if (!tracks.length) return new Response("Keep some tracks first.", { status: 400 });

  const crate = `FloorTest - ${collection?.name ?? "Kept"}`;
  await audit(user.id, "exported", `${crate.replace(/^FloorTest - /, "")} · ${tracks.length} track${tracks.length === 1 ? "" : "s"}`);
  const zip = crateZip(crate, base, tracks, (t) => markDownloaded(user, t));
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName(crate).replace(/[^\x20-\x7e]/g, "_")}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
