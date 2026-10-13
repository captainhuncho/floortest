import "server-only";
import { now, q, type Queryable } from "./db";
import { accountKeys, drainDeletions, handOverFolderCovers, queueDeletion, STUCK_AFTER, trackKeys } from "./deletion-core";
import { recordIncident } from "./incidents";
import { storage, UPLOAD_LINK_SECONDS } from "./storage";
import { vaultDeleter } from "./vault";

export { accountKeys, queueDeletion, trackKeys };

/** Queue a track's files (audio + stems) and drop its stem rows. Call inside the same transaction that retires the track. */
export async function retireTrackFiles(db: Queryable, trackIds: number[], reason: string) {
  if (!trackIds.length) return;
  // A folder's cover stays with the folder's remaining tracks rather than going with this one.
  await handOverFolderCovers(db, trackIds);
  await queueDeletion(db, await trackKeys(db, trackIds), reason, now());
  await db.run(`DELETE FROM stems WHERE track_id IN (${trackIds.map(() => "?").join(",")})`, ...trackIds);
}

/**
 * Deletes files that nothing points to any more (a replaced cover, a discarded upload). Each key is queued first, then
 * deleted straight away; one that fails stays queued for the nightly retry (and an incident if it keeps failing) instead
 * of being forgotten. Call it after the row that pointed to the file has changed. Never throws.
 */
export async function discardFiles(keys: (string | null | undefined)[], reason: string, { linkLive = false } = {}) {
  const list = await queueDeletion(q, keys, reason, now()).then(
    () => [...new Set(keys.filter((k): k is string => !!k))],
    () => [],
  );
  if (!list.length) return;
  // Deletes the recovery copy too, when there is one.
  const store = await vaultDeleter(await storage());
  // A sender's upload link (15 minutes) can put a file back after it's deleted: those stay queued, due again once the
  // link has expired, so the nightly clean-up removes anything re-uploaded.
  const again = now() + UPLOAD_LINK_SECONDS * 1000 + 60_000;
  for (const key of list)
    await store.delete(key).then(
      () =>
        linkLive
          ? q.run("UPDATE storage_deletions SET not_before = ?, attempts = 0 WHERE file_key = ?", again, key)
          : q.run("DELETE FROM storage_deletions WHERE file_key = ?", key),
      () => {},
    );
}

/** Deletes what's queued, now. Anything that fails stays queued for the nightly job; repeated failures raise an incident. */
export async function drainNow(limit = 500) {
  const r = await drainDeletions(q, await vaultDeleter(await storage()), now(), limit);
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
