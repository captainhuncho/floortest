import "server-only";
import { asPerson, q, type Track } from "@/lib/db";
import type { Row } from "./TrackList";
import { parseCues } from "@/lib/cues";

/**
 * The track columns the desk lists read (List, Review queue, a collection, Prepare for set): never the whole row, so the
 * receipt token, file keys and the rest stay in the database (owner rule "send only the fields needed", 1 Nov).
 */
const LIST_FIELDS = [
  "id", "sender_id", "title", "artist", "message", "genre", "duration", "bpm", "energy", "cues", "peaks", "decision",
  "played_at", "downloaded_at", "replied_at", "created_at", "release_status", "mix_status", "duplicate_of", "release_id", "track_no",
] as const;
export type ListTrack = Pick<Track, (typeof LIST_FIELDS)[number]>;
export const LIST_COLUMNS = LIST_FIELDS.map((f) => `t.${f}`).join(", ");

/**
 * Track rows for list views: every live track, optionally just one collection and/or just kept ones. The read runs as
 * `actor` (the signed-in person) under the per-person rules (B8) as well as the desk filter.
 */
export async function loadRows(userId: number, opts: { collectionId?: number; keptOnly?: boolean; inSet?: boolean; actor: number }): Promise<Row[]> {
  const where = ["t.user_id = ?", "t.deleted_at IS NULL"];
  const args: number[] = [userId];
  if (opts.collectionId) {
    where.push("t.collection_id = ?");
    args.push(opts.collectionId);
  }
  if (opts.keptOnly) where.push("t.decision = 'kept'");
  if (opts.inSet) where.push("t.decision = 'kept' AND t.set_cleared_at IS NULL");
  const read = () =>
    q.all<ListTrack & { sender_name: string; collection_name: string | null }>(
      `SELECT ${LIST_COLUMNS}, s.name AS sender_name, c.name AS collection_name FROM tracks t
       JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id
       WHERE ${where.join(" AND ")} ORDER BY ${opts.keptOnly || opts.inSet ? "t.decided_at DESC" : "t.created_at DESC"} LIMIT 500`,
      ...args,
    );
  const tracks = await asPerson(opts.actor, read);
  return tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    sender: t.sender_name,
    collection: opts.collectionId ? null : t.collection_name,
    genre: t.genre,
    duration: t.duration,
    bpm: t.bpm,
    peaks: t.peaks ? JSON.parse(t.peaks) : null,
    played: !!t.played_at,
    downloaded: !!t.downloaded_at,
    decision: t.decision,
    hasMessage: !!t.message,
    createdAt: t.created_at,
    energy: t.energy,
    cueCount: parseCues(t.cues, t.duration).length,
  }));
}

export const reviewHref = (id: number) => `/dashboard/review?view=queue&s=all&t=${id}`;
