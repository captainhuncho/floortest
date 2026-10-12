import { NextResponse } from "next/server";
import { recordIncident } from "@/lib/incidents";
import { cronAuthorized, recordRun } from "@/lib/cron";
import { runAdminDigest, runNudges } from "@/lib/jobs";
import { runFirstTrackNudges } from "@/lib/onboarding";
import { runDigests } from "@/lib/notify";
import { rerouteClosedLinks, sweepReopenAlerts } from "@/lib/reopen";
import { runPlayedOutReminders } from "@/lib/played-out-prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily on Vercel Hobby, hourly where available: digests and quiet-hours catch-up emails. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    // Links first: a link that moves off a closed collection may be the reopening a sender asked to hear about.
    const result = { linksRerouted: await rerouteClosedLinks(), reopenAlerts: await sweepReopenAlerts(), digestsSent: await runDigests(), nudges: await runNudges(), firstTrackNudges: await runFirstTrackNudges(), playedOutReminders: await runPlayedOutReminders(), adminDigest: await runAdminDigest() };
    await recordRun("digest", started, true, result);
    return NextResponse.json(result);
  } catch (e) {
    await recordRun("digest", started, false, e instanceof Error ? e.message : String(e));
    await recordIncident("cron_failed", "Digest job failed", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/digest");
    throw e;
  }
}
