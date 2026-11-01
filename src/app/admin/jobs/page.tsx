import { requireAdmin } from "@/lib/admin";
import { now as clock, q } from "@/lib/db";
import { JOBS, LATE_AFTER_MS, type JobName } from "@/lib/cron";
import { rerunRefusal } from "@/lib/cron-jobs";
import { runJobNow } from "../actions";
import { ConfirmSubmit } from "../AdminUi";
import { OpsForm } from "../OpsForm";

// Run now runs a job inside this page's request: as long as the cron routes allow.
export const maxDuration = 300;
/** The daily jobs ask before Run now; the queue drains (scan, mail) don't need to. */
const DAILY = new Set<JobName>(["purge", "digest"]);

export const metadata = { title: "Jobs — FloorTest admin" };

type Run = { id: number; job: JobName; started_at: number; ms: number; ok: number; result: string };

/** Runs shown before the rest fold away. */
const SHOWN = 10;
/** Recent runs drawn as dots on each job card. */
const STRIP = 12;

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

const when = (ms: number) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Every scheduled job, laid out like pins 87 and 93 (owner, 1 Nov): each job a card with its state, a bar that fills
 * from the last run toward "late", and its recent runs as dots; below, the runs as finished-task notices.
 */
export default async function Jobs() {
  const admin = await requireAdmin("jobs");
  const now = clock();
  const runs = await q.all<Run>("SELECT id, job, started_at, ms, ok, result FROM job_runs ORDER BY started_at DESC LIMIT 200");
  // Run now: why it isn't offered for a job right now (a daily job that already ran fine, or the backup for anyone but
  // the super admin), shown in words instead of a button that can't work.
  const names = Object.keys(JOBS) as JobName[];
  const notNow = Object.fromEntries(
    await Promise.all(names.map(async (j) => [j, j === "purge" && !admin.access.super ? "Only the super admin can run the backup and clean-up." : await rerunRefusal(j, now)] as const)),
  ) as Record<JobName, string | null>;
  const runRow = (r: Run) => (
    <li key={r.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
      <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-bold ${r.ok ? "bg-lime text-ink" : "bg-danger/20 text-danger"}`}>
        {r.ok ? "✓" : "✕"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[14px]">
          <b className="font-semibold">
            {JOBS[r.job]?.label ?? r.job}
            <span className="sr-only">{r.ok ? ", worked" : ", failed"}</span>
          </b>
          <span className="font-mono text-[12px] text-faint tnum">
            {when(r.started_at)} · {(r.ms / 1000).toFixed(1)} s
          </span>
        </p>
        <p className="mt-0.5 break-words text-[12.5px] text-mute">{summary(r.result) || (r.ok ? "Finished" : "Failed")}</p>
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      <header className="admin-rise">
        <span className="rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-bone ring-1 ring-line-2">Platform</span>
        <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-[-0.03em]">Jobs</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-mute">
          The jobs that run on a schedule. A failure, or a job not running for {LATE_AFTER_MS / 3_600_000} hours, shows on the Overview; failures also record an incident. Run now does a job's scheduled run straight away, never
          alongside one already going.
        </p>
      </header>

      <ul className="grid items-start gap-6 lg:grid-cols-2">
        {(Object.keys(JOBS) as JobName[]).map((j, i) => {
          const mine = runs.filter((r) => r.job === j);
          const last = mine[0];
          const late = last && now - last.started_at > LATE_AFTER_MS;
          const state = !last ? "Not run yet" : !last.ok ? "Failed" : late ? "Late" : "OK";
          const pill = !last ? "bg-ink-4 text-mute" : !last.ok || late ? "bg-danger/15 text-danger" : "bg-lime text-ink";
          const used = last ? Math.min(1, (now - last.started_at) / LATE_AFTER_MS) : 0;
          return (
            <li key={j} className="admin-panel admin-rise p-5" style={{ "--i": i } as React.CSSProperties}>
              <div className="flex items-start gap-3">
                <span aria-hidden className={`grid size-12 shrink-0 place-items-center rounded-[14px] ${i % 2 ? "bg-[var(--admin-violet)] text-[#120d33]" : "bg-lime text-ink"}`}>
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 8v4l3 2" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-snug">{JOBS[j].label}</p>
                  <p className="text-[12.5px] text-faint">{JOBS[j].schedule}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-bold ${pill}`}>{state}</span>
              </div>
              {/* Pin 87's three-part bar: last run, time since, and the point where it counts as late. */}
              <div className="mt-5 grid grid-cols-3 gap-1.5" aria-hidden>
                {[0, 1, 2].map((s) => {
                  const fill = Math.max(0, Math.min(1, used * 3 - s));
                  return (
                    <span key={s} className="h-2 overflow-hidden rounded-full bg-ink-4">
                      <span className={`admin-grow block h-full rounded-full ${late || (last && !last.ok) ? "bg-danger" : "bg-[var(--admin-violet)]"}`} style={{ width: `${fill * 100}%`, "--i": s } as React.CSSProperties} />
                    </span>
                  );
                })}
              </div>
              <div className="mt-2 grid grid-cols-3 text-[12px]">
                <span>
                  <span className="block font-semibold">Last run</span>
                  <span className="text-faint">{last ? when(last.started_at) : "None yet"}</span>
                </span>
                <span className="text-center">
                  <span className="block font-semibold">Took</span>
                  <span className="text-faint">{last ? `${(last.ms / 1000).toFixed(1)} s` : "–"}</span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold">Late after</span>
                  <span className="text-faint">{LATE_AFTER_MS / 3_600_000} h</span>
                </span>
              </div>
              <p className="mt-4 flex items-center gap-1.5" aria-label={`Last ${Math.min(STRIP, mine.length)} runs: ${mine.slice(0, STRIP).filter((r) => r.ok).length} worked`}>
                {mine.length ? (
                  mine
                    .slice(0, STRIP)
                    .reverse()
                    .map((r) => <span key={r.id} aria-hidden title={`${when(r.started_at)}: ${r.ok ? "worked" : "failed"}`} className={`size-2.5 rounded-full ${r.ok ? "bg-lime" : "bg-danger"}`} />)
                ) : (
                  <span className="text-[12px] text-faint">Runs will show here as dots.</span>
                )}
              </p>
              <div className="mt-4 border-t border-line pt-4">
                {notNow[j] ? (
                  <p className="text-[12.5px] text-mute">{notNow[j]}</p>
                ) : (
                  <OpsForm action={runJobNow.bind(null, j)} className="flex flex-wrap items-center gap-3">
                    {DAILY.has(j) ? (
                      <ConfirmSubmit message={`Run "${JOBS[j].label}" now? It makes up the failed or missed run; it won't run again today once this works.`} className="btn-ghost btn-sm">
                        Run now
                      </ConfirmSubmit>
                    ) : (
                      <button className="btn-ghost btn-sm">Run now</button>
                    )}
                  </OpsForm>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="runs-h" className="admin-panel admin-rise p-5" style={{ "--i": 4 } as React.CSSProperties}>
        <h2 id="runs-h" className="text-[16px] font-semibold">Recent runs</h2>
        {runs.length ? (
          <>
            <ul className="mt-2">{runs.slice(0, SHOWN).map(runRow)}</ul>
            {runs.length > SHOWN && (
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center border-t border-line text-[12.5px] text-mute hover:text-bone [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Show {runs.length - SHOWN} older runs</span>
                  <span className="hidden group-open:inline">Show fewer</span>
                </summary>
                <ul>{runs.slice(SHOWN).map(runRow)}</ul>
              </details>
            )}
          </>
        ) : (
          <p className="mt-2 text-[14px] text-mute">No runs recorded yet. History starts from the next scheduled run.</p>
        )}
      </section>
    </div>
  );
}
