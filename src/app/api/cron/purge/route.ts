import { NextResponse } from "next/server";
import { recordIncident } from "@/lib/incidents";
import { cleanupRecords, purgeExpired } from "@/lib/retention";
import { cronAuthorized, recordRun, withJobLease } from "@/lib/cron";
import { warnExpiring } from "@/lib/notify";
import { runBackup } from "@/lib/backup";
import { runVaultCopy } from "@/lib/vault";
import { runDigests } from "@/lib/file-digests";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily: clean up old records (runs even if the backup fails, and keeps the backup small), then a database backup
 * (must succeed before anything of people's is deleted), then warnings a week before deletion and retention deletions.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  // Never two copies at once (two backups, two deletion passes over the same rows).
  const out = await withJobLease("purge", () => runPurge(started));
  return out ?? NextResponse.json({ skipped: "already running" });
}

async function runPurge(started: number) {
  try {
    const records = await cleanupRecords();
    // Backup next. If it fails, no tracks are deleted tonight: retention waits for a night with a good backup.
    let backup;
    try {
      backup = await runBackup();
    } catch (e) {
      await recordIncident("cron_failed", "Nightly database backup failed; retention skipped", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
      await recordRun("purge", started, false, { error: "backup failed; no tracks deleted", ...records });
      return NextResponse.json({ error: "Backup failed; nothing was deleted" }, { status: 500 });
    }
    // The recovery copy of new files (when the vault is set up). A failure is reported but never blocks the rest.
    let vault;
    try {
      vault = await runVaultCopy(90_000);
      if (vault.on && vault.failed) await recordIncident("cron_failed", `${vault.failed} file(s) couldn't be copied to the recovery bucket`, "Retried next night. See Admin → Storage & costs.", "/api/cron/purge");
    } catch (e) {
      vault = { error: e instanceof Error ? e.message : String(e) };
      await recordIncident("cron_failed", "Copying files to the recovery bucket failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
    }
    // File fingerprints: new files first, then re-checks (src/lib/file-digests.ts). A failure never blocks the rest.
    let digests;
    try {
      digests = await runDigests(60_000);
    } catch (e) {
      digests = { error: e instanceof Error ? e.message : String(e) };
      await recordIncident("cron_failed", "Checking file fingerprints failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
    }
    const warned = await warnExpiring();
    const purged = await purgeExpired({ force: true });
    const result = { ...records, ...purged, ...warned, backup, vault, digests };
    await recordRun("purge", started, true, result);
    return NextResponse.json(result);
  } catch (e) {
    await recordRun("purge", started, false, e instanceof Error ? e.message : String(e));
    await recordIncident("cron_failed", "Daily cleanup job failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
    throw e;
  }
}
