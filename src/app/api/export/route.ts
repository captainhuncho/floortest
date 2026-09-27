import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { markDownloaded } from "@/lib/core";
import { crateZip, safeName } from "@/lib/crate";
import { q, type Collection, type Track } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/export?base=/Users/me/Music/FloorTest[&collection=ID][&all=1]
 * Kept tracks prepared for a set; with a collection, just that one; with all=1, the whole collection folder.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const cid = url.searchParams.get("collection");
  const base = (url.searchParams.get("base") || "").slice(0, 500);
  const filesOnly = url.searchParams.get("files") === "1";
  if (!base && !filesOnly) return new Response("Choose the folder you'll unzip into.", { status: 400 });

  const collection = cid ? await q.get<Collection>("SELECT * FROM collections WHERE id = ? AND user_id = ?", Number(cid), user.id) : undefined;
  if (cid && !collection) return new Response("Not found", { status: 404 });
  const whole = !!collection && url.searchParams.get("all") === "1";

  const tracks = await q.all<Track>(
    `SELECT * FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND file_key IS NOT NULL ${whole ? "" : "AND decision = 'kept'"} ${collection ? "" : "AND set_cleared_at IS NULL"}
     ${collection ? "AND collection_id = ?" : ""} ORDER BY ${whole ? "created_at" : "decided_at"}`,
    ...(collection ? [user.id, collection.id] : [user.id]),
  );
  if (!tracks.length) return new Response(whole ? "This collection is empty." : "Keep some tracks first.", { status: 400 });

  const crate = `FloorTest - ${collection ? (whole ? collection.name : `${collection.name} (kept)`) : "Kept"}`;
  await audit(user.id, "exported", `${crate.replace(/^FloorTest - /, "")} · ${tracks.length} track${tracks.length === 1 ? "" : "s"}${filesOnly ? " · files only" : ""}`);
  const zip = crateZip(crate, base, tracks, (t) => markDownloaded(user, t), filesOnly);
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName(crate).replace(/[^\x20-\x7e]/g, "_")}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
