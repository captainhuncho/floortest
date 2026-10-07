import { requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { JOBS, LATE_AFTER_MS, type JobName } from "@/lib/cron";

export const metadata = { title: "Jobs — FloorTest admin" };

type Run = { id: number; job: JobName; started_at: number; ms: number; ok: number; result: string };

/** Readable summary of what a run did, from the JSON it recorded. */
function summary(result: string) {
  try {
    const r = JSON.parse(result);
    if (typeof r === "string") return r;
    return Object.entries(r as Record<string, unknown>)
      .filter(([, v]) => typeof v === "number" || typeof v === "string" || typeof v === "boolean")
      .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${v}`)
      .join(" · ");
  } catch {
    return result;
  }
}

/** Every scheduled job run for the last 90 days: when, how long, whether it worked and what it did. */
export default async function Jobs() {
  await requireAdmin("jobs");
  const now = Date.now();
  const runs = await q.all<Run>("SELECT id, job, started_at, ms, ok, result FROM job_runs ORDER BY started_at DESC LIMIT 200");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
        <p className="mt-2 max-w-2xl text-mute">
          The jobs Vercel runs on a schedule. A failure, or a job not running for {LATE_AFTER_MS / 3_600_000} hours, shows on the Overview; failures also record an incident.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(JOBS) as JobName[]).map((j) => {
          const last = runs.find((r) => r.job === j);
          const late = last && now - last.started_at > LATE_AFTER_MS;
          const state = !last ? "Not run yet" : !last.ok ? "Failed" : late ? "Late" : "OK";
          const tone = !last ? "text-mute" : !last.ok || late ? "text-danger" : "text-lime";
          return (
            <div key={j} className="rounded-md border border-line p-4">
              <p className="label">{JOBS[j].label}</p>
              <p className={`mt-1 text-2xl font-bold ${tone}`}>{state}</p>
              <p className="mt-1 text-xs text-mute">
                {JOBS[j].schedule}
                {last && ` · last ${new Date(last.started_at).toLocaleString("en-GB")} · ${(last.ms / 1000).toFixed(1)} s`}
              </p>
            </div>
          );
        })}
      </div>
      <section aria-labelledby="runs-h" className="space-y-3">
        <h2 id="runs-h" className="text-lg font-semibold">
          Recent runs
        </h2>
        <ul className="divide-y divide-line rounded-md border border-line">
          {runs.map((r) => (
            <li key={r.id} className="space-y-1 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className={`chip mr-2 ${r.ok ? "border-lime/50 text-lime" : "border-danger/50 text-danger"}`}>{r.ok ? "OK" : "Failed"}</span>
                  {JOBS[r.job]?.label ?? r.job}
                </span>
                <span className="text-mute tnum">
                  {new Date(r.started_at).toLocaleString("en-GB")} · {(r.ms / 1000).toFixed(1)} s
                </span>
              </div>
              <p className="break-words text-xs text-mute">{summary(r.result)}</p>
            </li>
          ))}
          {!runs.length && <li className="px-3 py-6 text-mute">No runs recorded yet. History starts from the next scheduled run.</li>}
        </ul>
      </section>
    </div>
  );
}
