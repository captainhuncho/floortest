/**
 * Practice restore into a real Postgres (Safety, 4 Nov): a nightly backup loaded into a new, EMPTY Neon branch (or a
 * local Postgres) the way a real restore would be, then checked: row counts, foreign keys, identity sequences, that each
 * person sees only their own desk, receipt links (sealed and not, before and after the sealer), the recovery bucket's
 * copies, and /api/health; with the RTO and RPO. The result goes to docs/evidence/restore-drill-pg-<date>.md.
 *
 *   npx tsx --conditions=react-server scripts/restore-drill-pg.ts path/to/db-YYYY-MM-DDTHHMM.json.gz.enc            (dry run)
 *   npx tsx --conditions=react-server scripts/restore-drill-pg.ts path/to/db-YYYY-MM-DDTHHMM.json.gz.enc --confirm-drill
 *
 * The owner's steps: make the empty Neon branch (Neon console → Branches → New branch, with no schema or data), and
 * type its connection string, BACKUP_KEY and APP_SECRET when asked (nothing is shown or saved). APP_SECRET is the live
 * site's: sealed receipt copies only open with it. For the recovery bucket check, set the vault's S3_* settings first.
 *
 * Set RESTORE_REFUSE_HOSTS to the live database's Neon endpoint id (ep-…) first. It refuses when that's missing, when
 * DATABASE_URL or POSTGRES_URL is set in the shell (a production setting left there), when the target is on a refused
 * host, and when the target has any table in it. Without --confirm-drill it only reads. The evidence names the target
 * only as "a Neon branch (ep-…, region)".
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline";
import { gunzipSync } from "node:zlib";
import { openPostgres } from "../src/lib/db/client";
import { backupSecrets, openBackup } from "../src/lib/backup-crypto";
import { assertEmpty, checkRestore, drillEvidence, drillRefusal, redactHost, restoreInto, settingsRefusal, type Check, type Dump } from "../src/lib/restore-drill";

/** Asks for a value without showing what's typed (keys and connection strings). */
function hidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void };
    const write = out._writeToOutput.bind(rl);
    out._writeToOutput = (s: string) => {
      if (s.includes(prompt)) write(s);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const refuse = (why: string): never => {
  console.error(`Refused: ${why}`);
  process.exit(2);
};

async function main() {
  const file = process.argv.find((a) => a.endsWith(".enc") || a.endsWith(".json.gz"));
  const confirm = process.argv.includes("--confirm-drill");
  if (!file) return refuse("give the path to a backup file (db-….json.gz.enc).");
  const settings = settingsRefusal(process.env);
  if (settings) refuse(settings);

  const target = process.env.RESTORE_TARGET_URL || (await hidden("Empty target database URL (hidden): "));
  const why = drillRefusal(process.env, target);
  if (why) refuse(why);
  const host = redactHost(new URL(target).hostname.toLowerCase());
  if (!process.env.BACKUP_KEY) process.env.BACKUP_KEY = await hidden("BACKUP_KEY (hidden): ");
  if (!process.env.APP_SECRET) process.env.APP_SECRET = await hidden("Live APP_SECRET, to open sealed receipts (hidden): ");

  const dump = JSON.parse(gunzipSync(openBackup(readFileSync(file), backupSecrets())).toString()) as Dump;
  const rows = Object.values(dump.tables).reduce((n, r) => n + r.length, 0);
  console.log(`Backup ${file} from ${dump.created_at}: ${Object.keys(dump.tables).length} tables, ${rows} rows.`);
  console.log(`Target: ${host}`);

  const db = await openPostgres(target);
  try {
    await assertEmpty(db);
    console.log("Target is empty.");
    if (!confirm) {
      console.log("Dry run: nothing written. Add --confirm-drill to restore into it.");
      return;
    }
    // The app's own code (the health route) reads this from here on; the guard above already ran on the inherited one.
    process.env.DATABASE_URL = target;
    process.env.DB_AUTO_MIGRATE = "false";
    const started = Date.now();
    const restored = await restoreInto(db, dump);
    const { vault } = await import("../src/lib/vault");
    const v = await vault();
    const checks: Check[] = await checkRestore(db, restored, { vaultHead: v ? (k) => v.head(k) : undefined });
    const { GET } = await import("../src/app/api/health/route");
    const health = await GET(new Request("http://localhost/api/health", { headers: { "x-forwarded-for": "127.0.0.1" } }));
    checks.push({ name: "/api/health", ok: health.status === 200, detail: `answered ${health.status} against the restored database` });
    const rtoMs = Date.now() - started;
    const date = new Date().toISOString().slice(0, 10);
    const commit = execSync("git rev-parse --short HEAD").toString().trim();
    const out = `docs/evidence/restore-drill-pg-${date}.md`;
    writeFileSync(out, drillEvidence({ date, backupKey: file.split("/").pop()!, backupAt: dump.created_at, target: host, checks, rtoMs, rpoMs: started - Date.parse(dump.created_at), commit }));
    for (const c of checks) console.log(`${c.skipped ? "skip" : c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
    console.log(`\nEvidence written to ${out}. RTO ${Math.round(rtoMs / 1000)} s.`);
    if (checks.some((c) => !c.ok)) process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
