import "server-only";
import { now, q, type Queryable } from "./db";
import { accountKeys, drainDeletions, handOverFolderCovers, queueDeletion, STUCK_AFTER, trackKeys } from "./deletion-core";
import { recordIncident } from "./incidents";
import { storage } from "./storage";

export { accountKeys, queueDeletion, trackKeys };

/** Queue a track's files (audio + stems) and drop its stem rows. Call inside the same transaction that retires the track. */
export async function retireTrackFiles(db: Queryable, trackIds: number[], reason: string) {
  if (!trackIds.length) return;
  // A folder's cover stays with the folder's remaining tracks rather than going with this one.
  await handOverFolderCovers(db, trackIds);
  await queueDeletion(db, await trackKeys(db, trackIds), reason, now());
  await db.run(`DELETE FROM stems WHERE track_id IN (${trackIds.map(() => "?").join(",")})`, ...trackIds);
}

/** Deletes what's queued, now. Anything that fails stays queued for the nightly job; repeated failures raise an incident. */
export async function drainNow(limit = 500) {
  const r = await drainDeletions(q, await storage(), now(), limit);
  if (r.newlyStuck)
    await recordIncident(
      "server_error",
      `${r.newlyStuck} private file${r.newlyStuck === 1 ? "" : "s"} could not be deleted from storage after ${STUCK_AFTER} tries`,
      "See Admin → Storage & costs → Waiting to be deleted",
      "",
      { urgent: true },
    );
  const stuck = await q.count(`SELECT COUNT(*) AS n FROM storage_deletions WHERE attempts >= ${STUCK_AFTER}`);
  return { ...r, stuck };
}
