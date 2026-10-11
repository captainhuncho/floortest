import "server-only";
import { now, q } from "./db";
import { env } from "./env";
import { headIn } from "./storage";

/**
 * The storage move check (ops → Storage & costs). Before moving the audio bucket: a list of every file the database says
 * should exist, with sizes where we know them (the "before" record). After the copy: confirm each one is in the target
 * bucket at the right size, so the app is switched over only when nothing is missing. Each check is kept in app_state
 * and the admin log, as the move's audit trail. Read-only: it never writes or deletes a file.
 */

export type ExpectedFile = { key: string; kind: string; size: number | null };

/** Buckets this check may look at: the one the app uses now, and the two in the move. */
export const AUDIT_BUCKETS = [...new Set([env.storage.s3.bucket, "floortest-audio", "floortest-audio-eu"].filter((b): b is string => !!b))];

export async function expectedFiles(): Promise<ExpectedFile[]> {
  const rows = await q.all<{ key: string; kind: string; size: number | null }>(
    `SELECT file_key AS key, 'track audio' AS kind, size FROM tracks WHERE file_key IS NOT NULL
     UNION ALL SELECT art_key, 'track artwork', NULL FROM tracks WHERE art_key IS NOT NULL
     UNION ALL SELECT file_key, 'stem', size FROM stems
     UNION ALL SELECT cover_key, 'profile cover', NULL FROM users WHERE cover_key IS NOT NULL
     UNION ALL SELECT art_key, 'collection artwork', NULL FROM collections WHERE art_key IS NOT NULL`,
  );
  // Site images are referenced inside the site's content (drafts, published pages and saved versions).
  const content = await q.all<{ t: string }>("SELECT draft || published AS t FROM site_content UNION ALL SELECT body FROM site_content_versions");
  const site = new Set(content.flatMap((c) => c.t.match(/site\/[0-9a-f]{6,64}\.webp/g) ?? []));
  // Database backups are listed in app_state as they're written.
  let backups: string[] = [];
  try {
    backups = JSON.parse((await q.get<{ value: string }>("SELECT value FROM app_state WHERE key = 'backup_keys'"))?.value ?? "[]");
  } catch {}
  const all = [
    ...rows.map((r) => ({ key: r.key, kind: r.kind, size: r.size === null ? null : Number(r.size) })),
    ...[...site].map((key) => ({ key, kind: "site image", size: null })),
    ...backups.map((key) => ({ key, kind: "database backup", size: null })),
  ];
  // One row per key (a folder cover can be shared by tracks).
  return [...new Map(all.map((f) => [f.key, f])).values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
}

export type BucketCheck = {
  bucket: string;
  at: number;
  expected: number;
  checked: number;
  present: number;
  missing: { key: string; kind: string }[];
  wrongSize: { key: string; kind: string; want: number; got: number }[];
  finished: boolean;
};

/** Looks for every expected file in `bucket` (16 at a time, within a time budget so it fits a request). */
export async function checkBucket(bucket: string, budgetMs = 240_000): Promise<BucketCheck> {
  if (!AUDIT_BUCKETS.includes(bucket)) throw new Error("Not a bucket in the move");
  const files = await expectedFiles();
  const until = Date.now() + budgetMs;
  const out: BucketCheck = { bucket, at: now(), expected: files.length, checked: 0, present: 0, missing: [], wrongSize: [], finished: true };
  for (let i = 0; i < files.length; i += 16) {
    if (Date.now() > until) {
      out.finished = false;
      break;
    }
    const batch = files.slice(i, i + 16);
    const found = await Promise.all(batch.map((f) => headIn(bucket, f.key)));
    batch.forEach((f, j) => {
      out.checked++;
      const h = found[j];
      if (!h) out.missing.push({ key: f.key, kind: f.kind });
      else if (f.size !== null && h.size !== f.size) out.wrongSize.push({ key: f.key, kind: f.kind, want: f.size, got: h.size });
      else out.present++;
    });
  }
  await q.run(
    "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    `storage_check:${bucket}`,
    JSON.stringify({ ...out, missing: out.missing.slice(0, 200), wrongSize: out.wrongSize.slice(0, 200) }),
    out.at,
  );
  return out;
}

/** The latest check of each bucket, for the ops page. */
export async function lastChecks(): Promise<BucketCheck[]> {
  const rows = await q.all<{ value: string }>("SELECT value FROM app_state WHERE key LIKE 'storage_check:%' ORDER BY updated_at DESC");
  return rows.flatMap((r) => {
    try {
      return [JSON.parse(r.value) as BucketCheck];
    } catch {
      return [];
    }
  });
}
