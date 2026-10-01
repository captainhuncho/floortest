/**
 * Restore drill: loads a nightly backup into a brand-new, throwaway in-memory database (never production)
 * and checks every table comes back with the same row count.
 *   BACKUP_KEY=… npx tsx scripts/restore-drill.ts path/to/db-YYYY-MM-DDTHHMM.json.gz.enc
 * (the same key the server uses: BACKUP_KEY, or APP_SECRET when that is unset; older .json.gz files need none)
 * Download the file from the backups/ folder in the storage bucket first. Run it after schema changes too.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS } from "../src/lib/db/migrations";
import { backupSecret, openBackup } from "../src/lib/backup-crypto";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Give the path to a backup .json.gz");
  const dump = JSON.parse(gunzipSync(openBackup(readFileSync(file), file.endsWith(".enc") ? backupSecret() : "")).toString()) as { created_at: string; tables: Record<string, Record<string, unknown>[]> };

  const pg = await PGlite.create();
  await pg.exec("create table schema_migrations (id text primary key, applied_at bigint not null)");
  for (const m of MIGRATIONS) await pg.exec(m.sql);
  // Load in any order: foreign keys are checked once at the end, as in a real restore.
  await pg.exec("SET session_replication_role = replica");

  let problems = 0;
  for (const [table, rows] of Object.entries(dump.tables)) {
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map((c) => (row[c] !== null && typeof row[c] === "object" ? JSON.stringify(row[c]) : row[c]));
      await pg.query(
        `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(",")}) OVERRIDING SYSTEM VALUE VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
        vals,
      );
    }
    const n = Number((await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n);
    const ok = n === rows.length;
    if (!ok) problems++;
    console.log(`${ok ? "ok  " : "FAIL"} ${table}: ${n}/${rows.length}`);
  }
  await pg.exec("SET session_replication_role = origin");
  console.log(problems ? `\n${problems} table(s) did not restore cleanly.` : `\nBackup from ${dump.created_at} restores cleanly.`);
  process.exit(problems ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
