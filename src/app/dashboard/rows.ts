import "server-only";
import { q, type Track } from "@/lib/db";
import type { Row } from "./TrackList";
import { parseCues } from "@/lib/cues";

/** Track rows for list views: every live track, optionally just one collection and/or just kept ones. */
export async function loadRows(userId: number, opts: { collectionId?: number; keptOnly?: boolean; inSet?: boolean } = {}): Promise<Row[]> {
  const where = ["t.user_id = ?", "t.deleted_at IS NULL"];
  const args: number[] = [userId];
  if (opts.collectionId) {
    where.push("t.collection_id = ?");
    args.push(opts.collectionId);
  }
  if (opts.keptOnly) where.push("t.decision = 'kept'");
  if (opts.inSet) where.push("t.decision = 'kept' AND t.set_cleared_at IS NULL");
  const tracks = await q.all<Track & { sender_name: string; collection_name: string | null }>(
    `SELECT t.*, s.name AS sender_name, c.name AS collection_name FROM tracks t
     JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id
     WHERE ${where.join(" AND ")} ORDER BY ${opts.keptOnly || opts.inSet ? "t.decided_at DESC" : "t.created_at DESC"} LIMIT 500`,
    ...args,
  );
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
