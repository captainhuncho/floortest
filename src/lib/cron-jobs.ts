import "server-only";
import { recordIncident } from "@/lib/incidents";
import { cleanupRecords, purgeExpired } from "@/lib/retention";
import { NextResponse } from "next/server";
import { cronAuthorized, JOBS, lastRuns, recordRun, withJobLease, type JobName } from "@/lib/cron";
import { warnExpiring, runDigests as runReceiverDigests } from "@/lib/notify";
import { runBackup } from "@/lib/backup";
import { runVaultCopy } from "@/lib/vault";
import { runDigests as runFileDigests } from "@/lib/file-digests";
import { runAdminDigest, runNudges } from "@/lib/jobs";
import { runFirstTrackNudges } from "@/lib/onboarding";
import { rerouteClosedLinks, sweepReopenAlerts } from "@/lib/reopen";
import { runPlayedOutReminders } from "@/lib/played-out-prompt";
import { scanHeldUploads } from "@/lib/held-uploads";
import { drainOutbox } from "@/lib/mail";
import { sendDueReceipts } from "@/lib/send-receipts";
import { q } from "@/lib/db";

/**
 * The four scheduled jobs (src/lib/cron.ts JOBS), shared by their cron routes and Admin → Jobs → Run now (ops server
 * design, 1 Nov), so a run from ops is the same code as the scheduled one. Each records its own run and incidents;
 * callers wrap it in withJobLease so two copies never run at once.
 */
export type JobOutcome = { ok: boolean; result: unknown };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const detail = (e: unknown) => (e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e));

/**
 * Daily: clean up old records (runs even if the backup fails, and keeps the backup small), then a database backup
 * (must succeed before anything of people's is deleted), then warnings a week before deletion and retention deletions.
 */
async function purge(started: number): Promise<JobOutcome> {
  try {
    const records = await cleanupRecords();
    // Backup next. If it fails, no tracks are deleted tonight: retention waits for a night with a good backup.
    let backup;
    try {
      backup = await runBackup();
    } catch (e) {
      await recordIncident("cron_failed", "Nightly database backup failed; retention skipped", detail(e), "/api/cron/purge");
      await recordRun("purge", started, false, { error: "backup failed; no tracks deleted", ...records });
      return { ok: false, result: { error: "Backup failed; nothing was deleted" } };
    }
    // The recovery copy of new files (when the vault is set up). A failure is reported but never blocks the rest.
    let vault;
    try {
      vault = await runVaultCopy(90_000);
      if (vault.on && vault.failed) await recordIncident("cron_failed", `${vault.failed} file(s) couldn't be copied to the recovery bucket`, "Retried next night. See Admin → Storage & costs.", "/api/cron/purge");
    } catch (e) {
      vault = { error: message(e) };
      await recordIncident("cron_failed", "Copying files to the recovery bucket failed", detail(e), "/api/cron/purge");
    }
    // File fingerprints: new files first, then re-checks (src/lib/file-digests.ts). A failure never blocks the rest.
    let digests;
    try {
      digests = await runFileDigests(60_000);
    } catch (e) {
      digests = { error: message(e) };
      await recordIncident("cron_failed", "Checking file fingerprints failed", detail(e), "/api/cron/purge");
    }
    const warned = await warnExpiring();
    const purged = await purgeExpired({ force: true });
    const result = { ...records, ...purged, ...warned, backup, vault, digests };
    await recordRun("purge", started, true, result);
    return { ok: true, result };
  } catch (e) {
    await recordRun("purge", started, false, message(e));
    await recordIncident("cron_failed", "Daily cleanup job failed", detail(e), "/api/cron/purge");
    throw e;
  }
}

/**
 * The daily email steps, in order. Links first: a link that moves off a closed collection may be the reopening a sender
 * asked to hear about. The emails they write are queued; the mail job sends them.
 */
const DIGEST_STEPS: [string, () => Promise<unknown>][] = [
  ["linksRerouted", () => rerouteClosedLinks()],
  ["reopenAlerts", () => sweepReopenAlerts()],
  ["digestsSent", () => runReceiverDigests()],
  ["nudges", () => runNudges()],
  ["firstTrackNudges", () => runFirstTrackNudges()],
  ["playedOutReminders", () => runPlayedOutReminders()],
  ["adminDigest", () => runAdminDigest()],
];

/** Each step stands alone (backend audit, Batch B, 28 Oct): one that fails is reported by name and the rest still run. */
async function digest(started: number): Promise<JobOutcome> {
  const result: Record<string, unknown> = {};
  const failed: string[] = [];
  for (const [name, step] of DIGEST_STEPS) {
    try {
      result[name] = await step();
    } catch (e) {
      failed.push(name);
      result[name] = { error: message(e) };
      await recordIncident("cron_failed", `Daily emails: the ${name} step failed`, detail(e), "/api/cron/digest");
    }
  }
  await recordRun("digest", started, !failed.length, result);
  return { ok: !failed.length, result };
}

/** The held-uploads virus check: wakes the scanner once for the batch and delivers or refuses what's waiting. */
async function scan(started: number): Promise<JobOutcome> {
  try {
    const result = await scanHeldUploads();
    const busy = result.delivered + result.refused + result.gaveUp + result.waiting > 0;
    await recordRun("scan", started, true, result, { history: busy });
    return { ok: true, result };
  } catch (e) {
    await recordIncident("cron_failed", "Held uploads virus check failed", detail(e), "/api/cron/scan-held");
    await recordRun("scan", started, false, { error: message(e) });
    return { ok: false, result: { error: "Held uploads check failed" } };
  }
}

/** Up to this many emails a run; a send waits at most 5 s, and no new one starts after the budget. */
const MAIL_BATCH = 100;
const MAIL_BUDGET_MS = 240_000;

/**
 * The email queue (src/lib/mail.ts): receipts of sends whose wait is over (src/lib/send-receipts.ts), the digests and
 * reminders the daily job queued, retries of failed sends, and sends a crash interrupted. With nothing due it does
 * nothing and keeps no history row.
 */
async function mail(started: number): Promise<JobOutcome> {
  try {
    // Sends of several tracks whose last track never came: their one receipt email is queued now, then sent below.
    const receipts = await sendDueReceipts();
    const result = { ...(await drainOutbox(MAIL_BATCH, { until: started + MAIL_BUDGET_MS })), ...(receipts ? { receipts } : {}) };
    await recordRun("mail", started, true, result, { history: result.due > 0 || "stuck" in result });
    return { ok: true, result };
  } catch (e) {
    await recordIncident("cron_failed", "Email queue job failed", detail(e), "/api/cron/mail");
    await recordRun("mail", started, false, { error: message(e) });
    return { ok: false, result: { error: "Email queue failed" } };
  }
}

export const RUN_JOB: Record<JobName, (started: number) => Promise<JobOutcome>> = { purge, digest, scan, mail };

/** A cron route: the scheduler's secret, then the job under its lease ("skipped" when a copy is already running). */
export async function runCronRequest(req: Request, job: JobName) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const out = await withJobLease(job, () => RUN_JOB[job](started));
  if (!out) return NextResponse.json({ skipped: "already running" });
  return NextResponse.json(out.result, { status: out.ok ? 200 : 500 });
}

/** When the daily jobs are scheduled (vercel.json, UTC). */
const DAILY_AT_UTC: Partial<Record<JobName, [number, number]>> = { purge: [3, 30], digest: [8, 0] };

/** The latest scheduled time at or before `at` for a daily job. */
export function lastScheduled(job: JobName, at: number) {
  const [h, m] = DAILY_AT_UTC[job]!;
  const d = new Date(at);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m);
  return today <= at ? today : today - 86_400_000;
}

/**
 * Why Run now isn't allowed for this job right now, or null. The queue drains (scan, mail) can run any time. The daily
 * ones (daily emails, backup and clean-up) only make up a failed or missed run: nothing of theirs may have succeeded
 * since their latest scheduled time, so a good day never gets a second run.
 */
export async function rerunRefusal(job: JobName, at = Date.now()): Promise<string | null> {
  if (!DAILY_AT_UTC[job]) return null;
  const since = lastScheduled(job, at);
  const latest = (await lastRuns())[job];
  const good = latest?.ok && latest.at >= since ? latest.at : (await q.get<{ started_at: number }>("SELECT started_at FROM job_runs WHERE job = ? AND ok = 1 AND started_at >= ? ORDER BY started_at DESC LIMIT 1", job, since))?.started_at;
  if (good == null) return null;
  return `${JOBS[job].label} already ran fine at ${new Date(good).toISOString().slice(11, 16)} UTC. Running it again could repeat its work, so Run now is only for a failed or missed run.`;
}
