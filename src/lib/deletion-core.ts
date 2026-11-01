import type { Queryable } from "./db/client";

/**
 * Durable file deletion. Every private object (audio, stems, covers, pending uploads) is recorded in
 * storage_deletions *before* the rows that point to it are removed, so a failed delete is never forgotten:
 * it stays queued and is retried until the store confirms. Free of server-only imports so it can be tested.
 */
/** After this many failed tries a file counts as stuck and the admins are told (once). */
export const STUCK_AFTER = 5;

export type Deleter = { delete: (key: string) => Promise<void> };

export async function queueDeletion(db: Queryable, keys: (string | null | undefined)[], reason: string, at: number) {
  const unique = [...new Set(keys.filter((k): k is string => !!k))];
  for (const k of unique)
    await db.run("INSERT INTO storage_deletions (file_key, reason, created_at) VALUES (?,?,?) ON CONFLICT (file_key) DO NOTHING", k, reason.slice(0, 120), at);
  return unique.length;
}

/** Every object a track owns: its audio, its stems and its artwork. */
/**
 * An EP or album keeps one cover, stored on one of its tracks (the others borrow it). Before those tracks' files are deleted,
 * a cover on a track that's going passes to a track of the same folder that stays, unless one of those already has a cover.
 * The image then follows the folder's remaining tracks (and their auto-delete), instead of vanishing with the first track.
 * Run inside the same transaction as the deletion, before trackKeys().
 */
export async function handOverFolderCovers(db: Queryable, trackIds: number[]) {
  if (!trackIds.length) return 0;
  const marks = trackIds.map(() => "?").join(",");
  const going = await db.all<{ id: number; user_id: number; release_id: string; art_key: string }>(
    `SELECT id, user_id, release_id, art_key FROM tracks WHERE id IN (${marks}) AND art_key IS NOT NULL AND release_id IS NOT NULL`,
    ...trackIds,
  );
  let moved = 0;
  for (const t of going) {
    const stays = `user_id = ? AND release_id = ? AND deleted_at IS NULL AND id NOT IN (${marks})`;
    if (await db.get(`SELECT 1 FROM tracks WHERE ${stays} AND art_key IS NOT NULL LIMIT 1`, t.user_id, t.release_id, ...trackIds)) continue;
    const next = await db.get<{ id: number }>(
      `SELECT id FROM tracks WHERE ${stays} ORDER BY track_no NULLS LAST, created_at, id LIMIT 1`,
      t.user_id,
      t.release_id,
      ...trackIds,
    );
    if (!next) continue;
    await db.run("UPDATE tracks SET art_key = ? WHERE id = ?", t.art_key, next.id);
    await db.run("UPDATE tracks SET art_key = NULL WHERE id = ?", t.id);
    moved++;
  }
  return moved;
}

export async function trackKeys(db: Queryable, trackIds: number[]) {
  if (!trackIds.length) return [];
  const marks = trackIds.map(() => "?").join(",");
  const rows = await db.all<{ k: string | null }>(
    `SELECT file_key AS k FROM tracks WHERE id IN (${marks}) UNION ALL SELECT art_key FROM tracks WHERE id IN (${marks}) AND art_key IS NOT NULL UNION ALL SELECT file_key AS k FROM stems WHERE track_id IN (${marks})`,
    ...trackIds,
    ...trackIds,
    ...trackIds,
  );
  return rows.map((r) => r.k);
}

/** Everything an account owns in storage: desk audio, stems, unfinished uploads, the cover photo, collection artwork and the proof staff kept when verifying it. */
export async function accountKeys(db: Queryable, userId: number) {
  const rows = await db.all<{ k: string | null }>(
    `SELECT t.file_key AS k FROM tracks t WHERE t.user_id = ?
     UNION ALL SELECT t.art_key FROM tracks t WHERE t.user_id = ? AND t.art_key IS NOT NULL
     UNION ALL SELECT s.file_key FROM stems s JOIN tracks t ON t.id = s.track_id WHERE t.user_id = ?
     UNION ALL SELECT u.file_key FROM uploads u WHERE u.receiver_id = ?
     UNION ALL SELECT cover_key FROM users WHERE id = ?
     UNION ALL SELECT art_key FROM collections WHERE user_id = ? AND art_key IS NOT NULL
     UNION ALL SELECT f.file_key FROM verification_proofs f JOIN verification_proposals p ON p.id = f.proposal_id WHERE p.user_id = ?`,
    userId, userId, userId, userId, userId, userId, userId,
  );
  return rows.map((r) => r.k);
}

/** Tries every queued key. Success (or already gone) removes it from the queue; failure is kept with the error. */
export async function drainDeletions(db: Queryable, store: Deleter, at: number, limit = 500) {
  const rows = await db.all<{ file_key: string }>("SELECT file_key FROM storage_deletions WHERE not_before IS NULL OR not_before <= ? ORDER BY created_at LIMIT ?", at, limit);
  let deleted = 0;
  let failed = 0;
  let newlyStuck = 0; // reached 5 failed attempts on this run: reported once, not on every retry
  for (const { file_key } of rows) {
    try {
      await store.delete(file_key);
      await db.run("DELETE FROM storage_deletions WHERE file_key = ?", file_key);
      await db.run("DELETE FROM file_digests WHERE file_key = ?", file_key);
      deleted++;
    } catch (e) {
      failed++;
      const row = await db.get<{ attempts: number }>(
        "UPDATE storage_deletions SET attempts = attempts + 1, last_error = ?, last_attempt_at = ? WHERE file_key = ? RETURNING attempts",
        String(e instanceof Error ? e.message : e).slice(0, 300),
        at,
        file_key,
      );
      if (row && Number(row.attempts) === STUCK_AFTER) newlyStuck++;
    }
  }
  return { deleted, failed, newlyStuck, waiting: rows.length - deleted };
}
