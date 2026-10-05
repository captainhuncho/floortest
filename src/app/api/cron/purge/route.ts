import { NextResponse } from "next/server";
import { recordIncident } from "@/lib/incidents";
import { cleanupRecords, purgeExpired } from "@/lib/core";
import { cronAuthorized, recordRun } from "@/lib/cron";
import { warnExpiring } from "@/lib/notify";
import { runBackup } from "@/lib/backup";
import { finalizeAllDueConsents } from "@/lib/share";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily: clean up old records (runs even if the backup fails, and keeps the backup small), then a database backup
 * (must succeed before anything of people's is deleted), then warnings a week before deletion and retention deletions.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
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
    const warned = await warnExpiring();
    const purged = await purgeExpired({ force: true });
    const consents = await finalizeAllDueConsents();
    const result = { ...records, ...purged, ...warned, consents, backup };
    await recordRun("purge", started, true, result);
    return NextResponse.json(result);
  } catch (e) {
    await recordRun("purge", started, false, e instanceof Error ? e.message : String(e));
    await recordIncident("cron_failed", "Daily cleanup job failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
    throw e;
  }
}
