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

/** Every object a track owns: its audio and its stems. */
export async function trackKeys(db: Queryable, trackIds: number[]) {
  if (!trackIds.length) return [];
  const marks = trackIds.map(() => "?").join(",");
  const rows = await db.all<{ k: string | null }>(
    `SELECT file_key AS k FROM tracks WHERE id IN (${marks}) UNION ALL SELECT file_key AS k FROM stems WHERE track_id IN (${marks})`,
    ...trackIds,
    ...trackIds,
  );
  return rows.map((r) => r.k);
}

/** Everything an account owns in storage: desk audio, stems, unfinished uploads and the cover photo. */
export async function accountKeys(db: Queryable, userId: number) {
  const rows = await db.all<{ k: string | null }>(
    `SELECT t.file_key AS k FROM tracks t WHERE t.user_id = ?
     UNION ALL SELECT s.file_key FROM stems s JOIN tracks t ON t.id = s.track_id WHERE t.user_id = ?
     UNION ALL SELECT u.file_key FROM uploads u WHERE u.receiver_id = ?
     UNION ALL SELECT cover_key FROM users WHERE id = ?`,
    userId, userId, userId, userId,
  );
  return rows.map((r) => r.k);
}

/** Tries every queued key. Success (or already gone) removes it from the queue; failure is kept with the error. */
export async function drainDeletions(db: Queryable, store: Deleter, at: number, limit = 500) {
  const rows = await db.all<{ file_key: string }>("SELECT file_key FROM storage_deletions ORDER BY created_at LIMIT ?", limit);
  let deleted = 0;
  let failed = 0;
  let newlyStuck = 0; // reached 5 failed attempts on this run: reported once, not on every retry
  for (const { file_key } of rows) {
    try {
      await store.delete(file_key);
      await db.run("DELETE FROM storage_deletions WHERE file_key = ?", file_key);
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
