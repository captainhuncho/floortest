import { NextResponse } from "next/server";
import { recordIncident } from "@/lib/incidents";
import { purgeExpired } from "@/lib/core";
import { cronAuthorized, recordRun } from "@/lib/cron";
import { warnExpiring } from "@/lib/notify";
import { runBackup } from "@/lib/backup";
import { finalizeAllDueConsents } from "@/lib/share";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily: a database backup (must succeed first), then warnings a week before deletion, then retention deletions, abandoned uploads, expired sessions and rate-limit records. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    // Backup first. If it fails, nothing is deleted tonight: retention waits for a night with a good backup.
    let backup;
    try {
      backup = await runBackup();
    } catch (e) {
      await recordIncident("cron_failed", "Nightly database backup failed; retention skipped", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
      await recordRun("purge", started, false, "backup failed; nothing deleted");
      return NextResponse.json({ error: "Backup failed; nothing was deleted" }, { status: 500 });
    }
    const warned = await warnExpiring();
    const purged = await purgeExpired({ force: true });
    const consents = await finalizeAllDueConsents();
    const result = { ...purged, ...warned, consents, backup };
    await recordRun("purge", started, true, result);
    return NextResponse.json(result);
  } catch (e) {
    await recordRun("purge", started, false, e instanceof Error ? e.message : String(e));
    await recordIncident("cron_failed", "Daily cleanup job failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
    throw e;
  }
}
