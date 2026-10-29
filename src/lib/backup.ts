import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { now, q } from "./db";
import { backupSecret, sealBackup } from "./backup-crypto";
import { storage } from "./storage";
import { vault } from "./vault";

/** Kept this many days in the bucket, then deleted. */
export const BACKUP_KEEP_DAYS = 14;
const DAY = 86_400_000;
/**
 * Left out: short-lived or rebuildable (keeps backups small), and every sign-in session or one-time code (account,
 * ops, share-link listener, view-as), so a backup holds no live way in and a restore brings no session back. IP
 * addresses live only in rate_events and uploads, which are left out, so the 48-hour limit on them holds.
 */
export const SKIP = new Set([
  "sessions", "admin_sessions", "link_sessions", "view_tickets", "password_resets", "login_codes", "sender_codes", "link_codes", "passkey_challenges", "app_refresh_spent", "two_step_tickets",
  "rate_events", "uploads", "schema_migrations", "tap_timings", "job_runs", "feature_use", "listens", "webhook_receipts",
]);
/** One file per run (date and time), so a manual rerun never replaces the night's good backup. */
const keyFor = (t: number) => `backups/db-${new Date(t).toISOString().slice(0, 16).replace(":", "")}.json.gz.enc`;
/** Day-level prefix for the age cutoff: keys sort by date, so anything below this is older than the cutoff. */
const dayKey = (t: number) => `backups/db-${new Date(t).toISOString().slice(0, 10)}`;
/**
 * Live tokens and email bodies (they hold sign-in and unsubscribe links) are blanked: not needed to restore. Invite
 * codes (they open an account) and receipt tokens (tracks.token, they open a sender's receipt page) are replaced: an
 * invite code by the same stand-in on invites.code and users.invite_code (a keyed hash with a fresh key per backup, so
 * use counts survive a restore but the code can't be read back or guessed), a receipt token by a new random one (the
 * column is required and unique). After a restore, old invite codes and receipt links stop working. Password hashes and
 * encrypted two-factor secrets stay: people need them to sign in after a restore.
 */
type Row = Record<string, unknown>;
function scrubbers(): Record<string, (r: Row) => Row> {
  const key = randomBytes(32);
  const hideCode = (code: unknown) => (typeof code === "string" && code ? `hidden-${createHmac("sha256", key).update(code).digest("hex").slice(0, 24)}` : code);
  return {
    users: (r) => ({ ...r, pending_email_token: null, email_verify_token: null, invite_code: hideCode(r.invite_code) }),
    invites: (r) => ({ ...r, code: hideCode(r.code) }),
    tracks: (r) => ({ ...r, token: `restored-${randomBytes(24).toString("hex")}` }),
    outbox: (r) => ({ ...r, body: "" }),
  };
}

/**
 * Nightly logical backup: every table as JSON, gzipped and encrypted, into the recovery bucket (the vault) when it's set
 * up, otherwise the private storage bucket. A free safety net alongside the database host's own backups. Audio files are
 * copied to the vault separately (src/lib/vault.ts).
 */
export async function runBackup(at = now()) {
  // Every table is read in one read-only, repeatable-read transaction, so the backup shows a single moment: a track saved
  // mid-run is either there with its sender or not there at all (tables used to be read one by one: Batch C, 28 Oct).
  const { tables, data } = await q.tx(async (db) => {
    await db.run("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const tables = (
      await db.all<{ t: string }>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")
    )
      .map((r) => r.t)
      .filter((t) => !SKIP.has(t) && /^[a-z_]+$/.test(t));
    const data: Record<string, unknown[]> = {};
    const scrub = scrubbers();
    for (const t of tables) {
      const rows = await db.all<Row>(`SELECT * FROM "${t}"`);
      data[t] = scrub[t] ? rows.map(scrub[t]) : rows;
    }
    return { tables, data };
  });
  const body = sealBackup(gzipSync(Buffer.from(JSON.stringify({ created_at: new Date(at).toISOString(), tables: data }))), backupSecret());
  const main = await storage();
  const v = await vault();
  const target = v ?? main;
  await target.put(keyFor(at), new Uint8Array(body), "application/octet-stream");
  // Every backup ever written is listed in app_state (one list per place), so anything past the cutoff is found and
  // deleted however old it is or however many nights were missed. A failed delete stays listed and is retried tomorrow.
  // Backups written to the main bucket before the vault existed keep ageing out there.
  await ageOut(main, "backup_keys", v ? null : keyFor(at), at);
  if (v) await ageOut(v, "vault_backup_keys", keyFor(at), at);
  const rows = Object.values(data).reduce((n, r) => n + r.length, 0);
  await q.run(
    "INSERT INTO app_state (key, value, updated_at) VALUES ('last_backup', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    JSON.stringify({ at, key: keyFor(at), bytes: body.length, rows, tables: tables.length, vault: !!v }),
    at,
  );
  return { key: keyFor(at), bytes: body.length, rows, vault: !!v };
}

/** Adds `fresh` to the list kept under `listKey`, then deletes listed backups older than BACKUP_KEEP_DAYS from `store`. */
async function ageOut(store: { delete(key: string): Promise<void> }, listKey: string, fresh: string | null, at: number) {
  const listed = await q.get<{ value: string }>("SELECT value FROM app_state WHERE key = ?", listKey);
  let keys: string[] = [];
  try {
    keys = JSON.parse(listed?.value ?? "[]");
  } catch {}
  const cutoff = dayKey(at - BACKUP_KEEP_DAYS * DAY);
  const keep: string[] = [];
  for (const k of [...new Set([...keys, ...(fresh ? [fresh] : [])])]) {
    if (k > cutoff) keep.push(k); // keys are date-named, so they sort by date
    else if (!(await store.delete(k).then(() => true, () => false))) keep.push(k);
  }
  await q.run(
    "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    listKey,
    JSON.stringify(keep.sort()),
    at,
  );
}

export async function lastBackup() {
  const v = (await q.get<{ value: string }>("SELECT value FROM app_state WHERE key = 'last_backup'"))?.value;
  try {
    return v ? (JSON.parse(v) as { at: number; key: string; bytes: number; rows: number; tables: number }) : null;
  } catch {
    return null;
  }
}
