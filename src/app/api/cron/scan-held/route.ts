import { NextResponse } from "next/server";
import { cronAuthorized, recordRun, withJobLease } from "@/lib/cron";
import { scanHeldUploads } from "@/lib/held-uploads";
import { recordIncident } from "@/lib/incidents";

export const runtime = "nodejs";
// Waking the scanner (up to 150 s) and then scanning a batch of up to 20 files.
export const maxDuration = 300;

/**
 * Every 10 minutes: virus-checks the uploads held while the scanner was asleep or down, in one batch, with one wake-up
 * (src/lib/held-uploads.ts). With nothing held it does nothing, and the scanner stays asleep.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const out = await withJobLease("scan", async () => {
    try {
      const result = await scanHeldUploads();
      const busy = result.delivered + result.refused + result.gaveUp + result.waiting > 0;
      await recordRun("scan", started, true, result, { history: busy });
      return NextResponse.json(result);
    } catch (e) {
      await recordIncident("cron_failed", "Held uploads virus check failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/scan-held");
      await recordRun("scan", started, false, { error: e instanceof Error ? e.message : String(e) });
      return NextResponse.json({ error: "Held uploads check failed" }, { status: 500 });
    }
  });
  return out ?? NextResponse.json({ skipped: "already running" });
}
