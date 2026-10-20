import "server-only";
import crypto from "node:crypto";
import { env } from "./env";
import { q } from "./db";

/**
 * Scheduled endpoints need "Authorization: Bearer $CRON_SECRET" (what Vercel Cron sends).
 * Without a secret they only run in local development, never on a preview or the live site.
 */
export function cronAuthorized(req: Request) {
  if (!env.cronSecret) return process.env.NODE_ENV === "development";
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env.cronSecret}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export type JobRun = { at: number; ms: number; ok: boolean; result: unknown };

export const JOBS = {
  purge: { label: "Nightly backup and clean-up", schedule: "Every day at 03:30 UTC" },
  digest: { label: "Daily emails", schedule: "Every day at 08:00 UTC" },
} as const;
export type JobName = keyof typeof JOBS;
/** Daily jobs: one that hasn't run for this long has missed at least one night. */
export const LATE_AFTER_MS = 26 * 3_600_000;

/** Remembers each job's run (when, how long, ok or not, what it did): the latest for Admin → Overview, all of them for Admin → Jobs. */
export async function recordRun(job: JobName, startedAt: number, ok: boolean, result: unknown) {
  const run: JobRun = { at: startedAt, ms: Date.now() - startedAt, ok, result };
  await q
    .run("INSERT INTO job_runs (job, started_at, ms, ok, result) VALUES (?,?,?,?,?)", job, startedAt, run.ms, ok ? 1 : 0, JSON.stringify(result ?? "").slice(0, 4000))
    .catch((e) => console.error("[cron] could not record run history", e));
  await q
    .run(
      "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      `last_run_${job}`,
      JSON.stringify(run).slice(0, 4000),
      Date.now(),
    )
    .catch((e) => console.error("[cron] could not record run", e));
}

export async function lastRuns() {
  const rows = await q.all<{ key: string; value: string }>("SELECT key, value FROM app_state WHERE key IN ('last_run_purge', 'last_run_digest')");
  const get = (k: string) => {
    try {
      return JSON.parse(rows.find((r) => r.key === k)?.value ?? "null") as JobRun | null;
    } catch {
      return null;
    }
  };
  return { purge: get("last_run_purge"), digest: get("last_run_digest") };
}

/**
 * Jobs that failed last time or haven't run when they should have. A job that has never run counts too, once the app has
 * been installed (its first migration) for longer than a day's window: a missing schedule mustn't look healthy
 * (Codex review, 19 Oct).
 */
export async function jobProblems(at = Date.now()) {
  const runs = await lastRuns();
  const installed = Number((await q.get<{ t: number | null }>("SELECT MIN(applied_at) AS t FROM schema_migrations"))?.t ?? at);
  return (Object.keys(JOBS) as JobName[])
    .map((j) => {
      const r = runs[j];
      if (!r) return at - installed > LATE_AFTER_MS ? `${JOBS[j].label} has never run` : null;
      if (!r.ok) return `${JOBS[j].label} failed on ${new Date(r.at).toLocaleString("en-GB")}`;
      if (at - r.at > LATE_AFTER_MS) return `${JOBS[j].label} hasn't run since ${new Date(r.at).toLocaleString("en-GB")}`;
      return null;
    })
    .filter((x): x is string => !!x);
}
