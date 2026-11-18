import { q } from "@/lib/db";
import { playedOutStatus, type PlayedOutStatus } from "@/lib/played-out-prompt";
import type { Row } from "../TrackList";

/** What Prepare's rows and cover need beyond the list row: who sent each track, and its Played out status. */
export type CrateExtras = {
  status: Record<number, PlayedOutStatus>;
  /** Track id → sender id, for "Reply to the sender". */
  senders: Record<number, number>;
  /** Up to four covers for the crate: the callout covers of the kept tracks, in the crate's order, each once. */
  arts: string[];
};

/**
 * Prepare's kept tracks with their Played out status, senders and covers. A track has no picture of its own, so the
 * crate's cover is made from the covers of the callouts its tracks came in.
 */
export async function crateExtras(userId: number, rows: Row[]): Promise<CrateExtras> {
  const ids = rows.map((r) => r.id).filter(Number.isInteger).slice(0, 500);
  if (!ids.length) return { status: {}, senders: {}, arts: [] };
  const [status, found] = await Promise.all([
    playedOutStatus(userId, ids),
    q.all<{ id: number; sender_id: number; collection_id: number | null; art_key: string | null }>(
      `SELECT t.id, t.sender_id, t.collection_id, c.art_key FROM tracks t LEFT JOIN collections c ON c.id = t.collection_id
       WHERE t.user_id = ? AND t.id IN (${ids.map(() => "?").join(",")})`,
      userId,
      ...ids,
    ),
  ]);
  const byId = new Map(found.map((t) => [t.id, t]));
  const arts: string[] = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (!t?.collection_id || !t.art_key) continue;
    const src = `/api/collection-art/${t.collection_id}?v=${encodeURIComponent(t.art_key)}`;
    if (!arts.includes(src)) arts.push(src);
    if (arts.length === 4) break;
  }
  return { status, senders: Object.fromEntries(found.map((t) => [t.id, t.sender_id])), arts };
}
