import { q } from "./db";

/**
 * Staff listening is on hold (owner, 1 Nov 2026): "we don't want staff listening to track for now ... tracks that will
 * be listened is tracks that have been disputed or there's been an issue reported." The only dispute FloorTest records
 * against a track today is a takedown claim, so staff may play a track only while it has an open one. Checked on the
 * server by /api/admin/tracks/[id]/audio; the Play button is only a mirror of it.
 */
export async function staffMayPlay(trackId: number): Promise<boolean> {
  if (!Number.isSafeInteger(trackId) || trackId < 1) return false;
  return !!(await q.get("SELECT 1 FROM takedowns WHERE track_id = ? AND status = 'open' LIMIT 1", trackId));
}
