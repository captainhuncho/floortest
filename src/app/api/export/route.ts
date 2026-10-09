import { trackUse } from "@/lib/usage";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { markDownloaded } from "@/lib/review";
import { crateZip, safeName } from "@/lib/crate";
import { q, type Collection, type Track } from "@/lib/db";

export const runtime = "nodejs";
/** Largest single crate download: ZIP files without the 64-bit extension stop at 4 GB, and the download must finish in time. */
const MAX_CRATE_BYTES = 3 * 1024 ** 3;
const MAX_CRATE_TRACKS = 300;

export const maxDuration = 300;

/**
 * GET /api/export?name=Friday set[&base=/Users/me/Music][&collection=ID][&all=1]
 * `name` is the crate's folder; `base` (optional) is where it'll be unzipped, needed only for the Rekordbox XML.
 * Kept tracks prepared for a set; with a collection, just that one; with all=1, the whole collection folder.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const cid = url.searchParams.get("collection");
  const base = (url.searchParams.get("base") || "").slice(0, 500);
  const filesOnly = url.searchParams.get("files") === "1";
  const name = (url.searchParams.get("name") || "").replace(/[\\/:*?"<>|\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  await trackUse(user.id, "export");

  const collection = cid ? await q.get<Collection>("SELECT * FROM collections WHERE id = ? AND user_id = ?", Number(cid), user.id) : undefined;
  if (cid && !collection) return new Response("Not found", { status: 404 });
  const whole = !!collection && url.searchParams.get("all") === "1";

  const tracks = await q.all<Track>(
    // EPs and albums carry their release name, so the crate keeps them together in their own folder.
    `SELECT tracks.*, CASE WHEN r.title <> '' THEN r.title END AS release_folder
     FROM tracks LEFT JOIN releases r ON r.id = tracks.release_id
     WHERE tracks.user_id = ? AND tracks.deleted_at IS NULL AND tracks.file_key IS NOT NULL ${whole ? "" : "AND tracks.decision = 'kept'"} ${collection ? "" : "AND tracks.set_cleared_at IS NULL"}
     ${collection ? "AND tracks.collection_id = ?" : ""} ORDER BY ${whole ? "tracks.created_at" : "tracks.decided_at"}`,
    ...(collection ? [user.id, collection.id] : [user.id]),
  );
  if (!tracks.length) return new Response(whole ? "This collection is empty." : "Keep some tracks first.", { status: 400 });
  // One download has to finish inside the server's 5-minute limit, and a plain ZIP can't go past 4 GB.
  const bytes = tracks.reduce((n, t) => n + (t.size ?? 0), 0);
  if (bytes > MAX_CRATE_BYTES || tracks.length > MAX_CRATE_TRACKS)
    return new Response(
      `This crate is too big for one download (${tracks.length} tracks, ${(bytes / 1024 ** 3).toFixed(1)} GB; the limit is ${MAX_CRATE_TRACKS} tracks or ${MAX_CRATE_BYTES / 1024 ** 3} GB). Download it a collection at a time, or clear tracks you've already played out.`,
      { status: 413 },
    );

  const crate = name || `FloorTest - ${collection ? (whole ? collection.name : `${collection.name} (kept)`) : "Kept"}`;
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
