import "server-only";
import { now, q, type Queryable } from "./db";
import { queueDeletion } from "./deletion-core";

/**
 * Leftover uploads (Codex review, "durable upload reconciliation", 24 Oct). Cover photos, collection artwork and site
 * images are stored first and recorded second; a crash or an abandoned edit in between used to leave a file nobody
 * points to. Now each one is written down here before it is stored (`reserveFile`) and crossed off once the database
 * points to it (`settleFile`). Every night `reconcileFiles` looks at reservations older than RESERVATION_GRACE_MS: if
 * the file is in use it just crosses it off, and only if nothing points to it is the file queued for deletion. Nothing
 * is ever deleted from a raw bucket listing, and a file is kept at least a week (the recovery window).
 * Verification proof (src/lib/verification-proposals.ts) is reserved the same way: a proof uploaded for a proposal that
 * was never sent is removed a week on.
 * Sender audio and track artwork have their own record, `uploads` (src/lib/intake.ts, src/lib/track-art.ts).
 */
export type FileKind = "cover" | "collection_art" | "site_image" | "verification_proof";

export const RESERVATION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** Written before the file is stored, so a crash at any later point still leaves a record of it. */
export const reserveFile = (key: string, kind: FileKind) =>
  q.run("INSERT INTO file_reservations (file_key, kind, created_at) VALUES (?, ?, ?) ON CONFLICT (file_key) DO NOTHING", key, kind, now());

/** The database now points to the file. If this fails, the nightly check finds the file in use and crosses it off. */
export const settleFile = (key: string) =>
  q.run("DELETE FROM file_reservations WHERE file_key = ?", key).then(
    () => undefined,
    (e) => console.error("[file-reservations] settle failed; the nightly check will settle it", e),
  );

/** Whether anything still points to the file. Site images are found by their random name inside page content or its history. */
async function inUse(db: Queryable, key: string, kind: FileKind) {
  if (kind === "cover") return !!(await db.get("SELECT 1 FROM users WHERE cover_key = ?", key));
  if (kind === "collection_art") return !!(await db.get("SELECT 1 FROM collections WHERE art_key = ?", key));
  if (kind === "verification_proof") return !!(await db.get("SELECT 1 FROM verification_proofs WHERE file_key = ?", key));
  const name = key.slice(key.lastIndexOf("/") + 1);
  return !!(
    (await db.get("SELECT 1 FROM site_content WHERE strpos(draft, ?) > 0 OR strpos(published, ?) > 0", name, name)) ||
    (await db.get("SELECT 1 FROM site_content_versions WHERE strpos(body, ?) > 0", name))
  );
}

/** Nightly: settles reservations past the grace period and queues the files nothing points to. Returns how many. */
export async function reconcileFiles(t = now(), limit = 200) {
  const due = await q.all<{ file_key: string; kind: FileKind }>(
    "SELECT file_key, kind FROM file_reservations WHERE created_at < ? ORDER BY created_at LIMIT ?",
    t - RESERVATION_GRACE_MS,
    limit,
  );
  let queued = 0;
  for (const r of due)
    await q.tx(async (db) => {
      if (!(await inUse(db, r.file_key, r.kind))) {
        await queueDeletion(db, [r.file_key], `unreferenced ${r.kind.replace("_", " ")} upload`, t);
        queued++;
      }
      await db.run("DELETE FROM file_reservations WHERE file_key = ?", r.file_key);
    });
  return queued;
}
