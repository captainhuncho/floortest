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

/** Remembers each job's last run (when, how long, ok or not, what it did) for Admin → Overview. */
export async function recordRun(job: "purge" | "digest", startedAt: number, ok: boolean, result: unknown) {
  const run: JobRun = { at: startedAt, ms: Date.now() - startedAt, ok, result };
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
