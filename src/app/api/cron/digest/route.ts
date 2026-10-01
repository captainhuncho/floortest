import { NextResponse } from "next/server";
import { recordIncident } from "@/lib/incidents";
import { cronAuthorized, recordRun } from "@/lib/cron";
import { runAdminDigest, runNudges } from "@/lib/jobs";
import { runDigests } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily on Vercel Hobby, hourly where available: digests and quiet-hours catch-up emails. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const result = { digestsSent: await runDigests(), nudges: await runNudges(), adminDigest: await runAdminDigest() };
    await recordRun("digest", started, true, result);
    return NextResponse.json(result);
  } catch (e) {
    await recordRun("digest", started, false, e instanceof Error ? e.message : String(e));
    await recordIncident("cron_failed", "Digest job failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/digest");
    throw e;
  }
}
