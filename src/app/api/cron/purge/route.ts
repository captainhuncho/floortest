import { NextResponse } from "next/server";
import { recordIncident } from "@/lib/incidents";
import { purgeExpired } from "@/lib/core";
import { cronAuthorized } from "@/lib/cron";
import { warnExpiring } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily: warnings a week before deletion, then retention deletions, abandoned uploads, expired sessions and rate-limit records. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const warned = await warnExpiring();
    return NextResponse.json({ ...(await purgeExpired({ force: true })), ...warned });
  } catch (e) {
    await recordIncident("cron_failed", "Daily cleanup job failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/purge");
    throw e;
  }
}
