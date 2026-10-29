import "server-only";
import { q, type Collection, type Track } from "./db";
import { withoutHeld } from "./file-digests";
import { storage } from "./storage";
import { zipStream, type Entry } from "./zip";

export { crateFileName, m3u, rekordboxXml, safeName } from "./rekordbox";
import { cratePath, m3u, rekordboxXml, safeName, textStream } from "./rekordbox";

/**
 * The tracks a crate download serves: with ids, exactly those on the desk (whatever their decision); otherwise kept
 * tracks prepared for a set, or with a collection just that one (all of it when `whole`). Files held back by the
 * fingerprint check (src/lib/file-digests.ts) are left out, so they are never streamed or marked Downloaded.
 */
export async function crateTracks(userId: number, sel: { ids?: number[]; collection?: Collection; whole?: boolean }) {
  const { ids = [], collection, whole = false } = sel;
  const tracks = ids.length
    ? await q.all<Track>(
        `SELECT tracks.*, CASE WHEN r.title <> '' THEN r.title END AS release_folder
         FROM tracks LEFT JOIN releases r ON r.id = tracks.release_id
         WHERE tracks.user_id = ? AND tracks.deleted_at IS NULL AND tracks.file_key IS NOT NULL AND tracks.id IN (${ids.map(() => "?").join(",")})
         ORDER BY tracks.created_at`,
        userId,
        ...ids,
      )
    : await q.all<Track>(
        // EPs and albums carry their release name, so the crate keeps them together in their own folder.
        `SELECT tracks.*, CASE WHEN r.title <> '' THEN r.title END AS release_folder
         FROM tracks LEFT JOIN releases r ON r.id = tracks.release_id
         WHERE tracks.user_id = ? AND tracks.deleted_at IS NULL AND tracks.file_key IS NOT NULL ${whole ? "" : "AND tracks.decision = 'kept'"} ${collection ? "" : "AND tracks.set_cleared_at IS NULL"}
         ${collection ? "AND tracks.collection_id = ?" : ""} ORDER BY ${whole ? "tracks.created_at" : "tracks.decided_at"}`,
        ...(collection ? [userId, collection.id] : [userId]),
      );
  return withoutHeld(tracks, (t) => t.file_key);
}

export function crateZip(
  crateName: string,
  baseDir: string,
  tracks: Track[],
  onTrackSent?: (t: Track) => Promise<void> | void,
  filesOnly = false,
) {
  const folder = safeName(crateName);
  const files = tracks.filter((t) => t.file_key);
  const entries: Entry[] = [
    ...(filesOnly
      ? []
      : [
          // The XML needs absolute paths, so it's only included when we know where the crate will be unzipped.
          ...(baseDir ? [{ name: `${folder}/rekordbox.xml`, open: async () => textStream(rekordboxXml(crateName, baseDir, files)) }] : []),
          { name: `${folder}/${folder}.m3u8`, open: async () => textStream(m3u(files)) },
        ]),
    ...files.map((t) => ({
      name: `${folder}/${cratePath(t)}`,
      open: async () => (await (await storage()).stream(t.file_key!)).body,
      onSent: onTrackSent && (() => onTrackSent(t)),
    })),
  ];
  return zipStream(entries);
}
