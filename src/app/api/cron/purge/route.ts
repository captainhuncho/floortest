import { NextResponse } from "next/server";
import { recordIncident } from "@/lib/incidents";
import { purgeExpired } from "@/lib/core";
import { cronAuthorized } from "@/lib/cron";
import { warnExpiring } from "@/lib/notify";
import { runBackup } from "@/lib/backup";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily: a database backup, warnings a week before deletion, then retention deletions, abandoned uploads, expired sessions and rate-limit records. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const warned = await warnExpiring();
    const purged = await purgeExpired({ force: true });
    // The backup failing shouldn't undo the cleanup, so it's recorded on its own.
    const backup = await runBackup().catch(async (e) => {
      await recordIncident("cron_failed", "Nightly database backup failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
      return null;
    });
    return NextResponse.json({ ...purged, ...warned, backup });
  } catch (e) {
    await recordIncident("cron_failed", "Daily cleanup job failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
    throw e;
  }
}
