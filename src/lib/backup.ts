import "server-only";
import { gzipSync } from "node:zlib";
import { now, q } from "./db";
import { backupSecret, sealBackup } from "./backup-crypto";
import { storage } from "./storage";

/** Kept this many days in the bucket, then deleted. */
export const BACKUP_KEEP_DAYS = 14;
const DAY = 86_400_000;
/**
 * Left out: short-lived or rebuildable (keeps backups small), and every sign-in session or one-time code (account,
 * ops, share-link listener, view-as), so a backup holds no live way in and a restore brings no session back. IP
 * addresses live only in rate_events and uploads, which are left out, so the 48-hour limit on them holds.
 */
export const SKIP = new Set([
  "sessions", "admin_sessions", "link_sessions", "view_tickets", "password_resets", "login_codes", "sender_codes", "link_codes",
  "rate_events", "uploads", "schema_migrations", "tap_timings", "job_runs", "feature_use",
]);
/** One file per run (date and time), so a manual rerun never replaces the night's good backup. */
const keyFor = (t: number) => `backups/db-${new Date(t).toISOString().slice(0, 16).replace(":", "")}.json.gz.enc`;
/** Day-level prefix for the age cutoff: keys sort by date, so anything below this is older than the cutoff. */
const dayKey = (t: number) => `backups/db-${new Date(t).toISOString().slice(0, 10)}`;
/** Live tokens and email bodies (they hold sign-in and unsubscribe links) are blanked: not needed to restore. */
const SCRUB: Record<string, Record<string, unknown>> = {
  users: { pending_email_token: null, email_verify_token: null },
  outbox: { body: "" },
};

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
  for (const t of tables) {
    const rows = await q.all<Record<string, unknown>>(`SELECT * FROM "${t}"`);
    data[t] = SCRUB[t] ? rows.map((r) => ({ ...r, ...SCRUB[t] })) : rows;
  }
  const body = sealBackup(gzipSync(Buffer.from(JSON.stringify({ created_at: new Date(at).toISOString(), tables: data }))), backupSecret());
  const store = await storage();
  await store.put(keyFor(at), new Uint8Array(body), "application/octet-stream");
  // Every backup ever written is listed in app_state, so anything past the cutoff is found and deleted however
  // old it is or however many nights were missed. A failed delete stays on the list and is retried tomorrow.
  const listed = await q.get<{ value: string }>("SELECT value FROM app_state WHERE key = 'backup_keys'");
  let keys: string[] = [];
  try {
    keys = JSON.parse(listed?.value ?? "[]");
  } catch {}
  const cutoff = dayKey(at - BACKUP_KEEP_DAYS * DAY);
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
