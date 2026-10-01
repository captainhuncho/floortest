import { NextResponse } from "next/server";
import { recordIncident } from "@/lib/incidents";
import { purgeExpired } from "@/lib/core";
import { cronAuthorized } from "@/lib/cron";
import { warnExpiring } from "@/lib/notify";
import { runBackup } from "@/lib/backup";
import { finalizeAllDueConsents } from "@/lib/share";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily: a database backup (must succeed first), then warnings a week before deletion, then retention deletions, abandoned uploads, expired sessions and rate-limit records. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Backup first. If it fails, nothing is deleted tonight: retention waits for a night with a good backup.
    let backup;
    try {
      backup = await runBackup();
    } catch (e) {
      await recordIncident("cron_failed", "Nightly database backup failed; retention skipped", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
      return NextResponse.json({ error: "Backup failed; nothing was deleted" }, { status: 500 });
    }
    const warned = await warnExpiring();
    const purged = await purgeExpired({ force: true });
    const consents = await finalizeAllDueConsents();
    return NextResponse.json({ ...purged, ...warned, consents, backup });
  } catch (e) {
    await recordIncident("cron_failed", "Daily cleanup job failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
    throw e;
  }
}
