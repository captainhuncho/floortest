import "server-only";
import { gzipSync } from "node:zlib";
import { now, q } from "./db";
import { storage } from "./storage";

/** Kept this many days in the bucket, then deleted. */
export const BACKUP_KEEP_DAYS = 14;
const DAY = 86_400_000;
/** Short-lived or rebuildable: left out to keep backups small. */
const SKIP = new Set(["sessions", "rate_events", "uploads", "password_resets", "schema_migrations"]);
const keyFor = (t: number) => `backups/db-${new Date(t).toISOString().slice(0, 10)}.json.gz`;

/**
 * Nightly logical backup: every table as JSON, gzipped, into the private storage bucket.
 * A free safety net alongside (or instead of) the database host's own backups. Audio files aren't copied;
 * they already live in the bucket.
 */
export async function runBackup(at = now()) {
  const tables = (
    await q.all<{ t: string }>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")
  )
    .map((r) => r.t)
    .filter((t) => !SKIP.has(t) && /^[a-z_]+$/.test(t));
  const data: Record<string, unknown[]> = {};
  for (const t of tables) data[t] = await q.all(`SELECT * FROM ${t}`);
  const body = gzipSync(Buffer.from(JSON.stringify({ created_at: new Date(at).toISOString(), tables: data })));
  const store = await storage();
  await store.put(keyFor(at), new Uint8Array(body), "application/gzip");
  // Every backup ever written is listed in app_state, so anything past the cutoff is found and deleted however
  // old it is or however many nights were missed. A failed delete stays on the list and is retried tomorrow.
  const listed = await q.get<{ value: string }>("SELECT value FROM app_state WHERE key = 'backup_keys'");
  let keys: string[] = [];
  try {
    keys = JSON.parse(listed?.value ?? "[]");
  } catch {}
  const cutoff = keyFor(at - BACKUP_KEEP_DAYS * DAY);
  const keep: string[] = [];
  for (const k of [...new Set([...keys, keyFor(at)])]) {
    if (k > cutoff) keep.push(k); // keys are date-named, so they sort by date
    else if (!(await store.delete(k).then(() => true, () => false))) keep.push(k);
  }
  await q.run(
    "INSERT INTO app_state (key, value, updated_at) VALUES ('backup_keys', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    JSON.stringify(keep.sort()),
    at,
  );
  const rows = Object.values(data).reduce((n, r) => n + r.length, 0);
  await q.run(
    "INSERT INTO app_state (key, value, updated_at) VALUES ('last_backup', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    JSON.stringify({ at, key: keyFor(at), bytes: body.length, rows, tables: tables.length }),
    at,
  );
  return { key: keyFor(at), bytes: body.length, rows };
}

export async function lastBackup() {
  const v = (await q.get<{ value: string }>("SELECT value FROM app_state WHERE key = 'last_backup'"))?.value;
  try {
    return v ? (JSON.parse(v) as { at: number; key: string; bytes: number; rows: number; tables: number }) : null;
  } catch {
    return null;
  }
}
