import { NextResponse } from "next/server";
import { recordIncident } from "@/lib/incidents";
import { cronAuthorized, recordRun, withJobLease } from "@/lib/cron";
import { runAdminDigest, runNudges } from "@/lib/jobs";
import { runFirstTrackNudges } from "@/lib/onboarding";
import { runDigests } from "@/lib/notify";
import { rerouteClosedLinks, sweepReopenAlerts } from "@/lib/reopen";
import { runPlayedOutReminders } from "@/lib/played-out-prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The daily steps, in order. Links first: a link that moves off a closed collection may be the reopening a sender asked
 * to hear about. The emails they write are queued; `/api/cron/mail` sends them.
 */
const STEPS: [string, () => Promise<unknown>][] = [
  ["linksRerouted", () => rerouteClosedLinks()],
  ["reopenAlerts", () => sweepReopenAlerts()],
  ["digestsSent", () => runDigests()],
  ["nudges", () => runNudges()],
  ["firstTrackNudges", () => runFirstTrackNudges()],
  ["playedOutReminders", () => runPlayedOutReminders()],
  ["adminDigest", () => runAdminDigest()],
];

/** Daily on Vercel Hobby, hourly where available: digests and quiet-hours catch-up emails. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  // Never two copies at once (a retry while the first still runs would send emails twice).
  const out = await withJobLease("digest", () => runDigest(started));
  return out ?? NextResponse.json({ skipped: "already running" });
}

/** Each step stands alone (backend audit, Batch B, 28 Oct): one that fails is reported by name and the rest still run. */
async function runDigest(started: number) {
  const result: Record<string, unknown> = {};
  const failed: string[] = [];
  for (const [name, step] of STEPS) {
    try {
      result[name] = await step();
    } catch (e) {
      failed.push(name);
      result[name] = { error: e instanceof Error ? e.message : String(e) };
      await recordIncident("cron_failed", `Daily emails: the ${name} step failed`, e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/cron/digest");
    }
  }
  await recordRun("digest", started, !failed.length, result);
  return NextResponse.json(result, { status: failed.length ? 500 : 200 });
}
