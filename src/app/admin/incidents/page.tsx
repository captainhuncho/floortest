import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { q } from "@/lib/db";
import { ConfirmButton } from "../AdminUi";
import { resolveAllIncidents, resolveIncident } from "../actions";
import { LevelPill, LogTime, PageHead } from "../PinParts";

const KINDS: Record<string, string> = {
  server_error: "Server error",
  upload_failed: "Upload failed",
  upload_rejected: "Upload refused",
  cron_failed: "Scheduled job failed",
  email_failed: "Email failed",
};
/** A visitor's file being refused is information, not a fault: it never goes on the to-do list. */
const INFO = new Set(["upload_rejected"]);

/**
 * Everything that went wrong, newest first, laid out like pin 96's log (owner, 1 Nov): mono time, a level label
 * (Error, or Info for refused uploads), what broke and where; open the row for the detail. Open ones count on the
 * Overview until they're marked handled.
 */
export default async function Incidents({ searchParams }: { searchParams: Promise<{ kind?: string; show?: string }> }) {
  await requireAdmin("incidents.read");
  const sp = await searchParams;
  const filter = sp.kind && KINDS[sp.kind] ? sp.kind : null;
  const showAll = sp.show === "all";
  const where = [filter ? "kind = ?" : "", showAll ? "" : "resolved_at IS NULL"].filter(Boolean).join(" AND ");
  const rows = await q.all<{ id: number; kind: string; message: string; detail: string; path: string; created_at: number; resolved_at: number | null }>(
    `SELECT * FROM incidents ${where ? `WHERE ${where}` : ""} ORDER BY created_at DESC LIMIT 200`,
    ...(filter ? [filter] : []),
  );
  const counts = await q.all<{ kind: string; n: number }>("SELECT kind, COUNT(*)::int AS n FROM incidents WHERE resolved_at IS NULL GROUP BY kind");
  const n = (k: string) => counts.find((c) => c.kind === k)?.n ?? 0;
  const open = counts.reduce((s, c) => s + (INFO.has(c.kind) ? 0 : c.n), 0);
  const link = (k: string | null, all = showAll) => `/admin/incidents?${new URLSearchParams({ ...(k ? { kind: k } : {}), ...(all ? { show: "all" } : {}) })}`;
  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Platform"
        title="Incidents"
        aside={
          <div className="flex flex-wrap gap-2">
            <Link href={link(filter, !showAll)} className="admin-press inline-flex min-h-11 items-center rounded-full px-5 text-[13.5px] font-semibold ring-1 ring-line-2 hover:bg-ink-3">
              {showAll ? "Open only" : "Show handled too"}
            </Link>
            {rows.some((r) => !r.resolved_at) && (
              <ConfirmButton
                action={resolveAllIncidents.bind(null, filter ?? "")}
                message={`Mark every open ${filter ? `"${KINDS[filter]}" ` : ""}incident as handled?`}
                confirmLabel="Mark all handled"
                className="admin-press inline-flex min-h-11 items-center rounded-full bg-bone px-5 text-[13.5px] font-semibold text-ink"
              >
                Mark all handled
              </ConfirmButton>
            )}
          </div>
        }
      >
        {open ? `${open} open.` : "Nothing open."} Mark each one handled once it&apos;s dealt with; refused uploads are kept for reference only.
      </PageHead>

      <section aria-label="Incidents" className="admin-panel admin-rise p-4 sm:p-5" style={{ "--i": 1 } as React.CSSProperties}>
        <nav aria-label="Filter by kind" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[[null, "All", counts.reduce((s, c) => s + c.n, 0)] as const, ...Object.entries(KINDS).map(([k, label]) => [k, label, n(k)] as const)].map(([k, label, count]) => {
            const on = filter === k;
            const hot = !!k && count > 0 && !INFO.has(k);
            return (
              <Link
                key={label}
                href={link(k)}
                aria-current={on ? "page" : undefined}
                className={`admin-press inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold ${on ? "bg-bone text-ink" : "text-mute ring-1 ring-line hover:text-bone"}`}
              >
                {label}
                <span className={`rounded-full px-1.5 text-[11px] tnum ${on ? "bg-ink/10" : hot ? "bg-danger/20 text-danger" : "bg-ink-4"}`}>{count}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 overflow-hidden rounded-[16px] ring-1 ring-line">
          <div aria-hidden className="hidden grid-cols-[190px_110px_minmax(0,1fr)_auto] gap-4 bg-ink-3 px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint md:grid">
            <span>Time</span>
            <span>Level</span>
            <span>What went wrong</span>
            <span>State</span>
          </div>
          <ul>
            {rows.map((r, i) => {
              const info = INFO.has(r.kind);
              return (
                <li key={r.id} className={`admin-rise border-t border-line first:border-t-0 md:first:border-t ${r.resolved_at ? "opacity-60" : ""}`} style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                  <div className="grid gap-x-4 gap-y-2 px-4 py-3.5 md:grid-cols-[190px_110px_minmax(0,1fr)_auto] md:items-center">
                    <LogTime at={r.created_at} id={r.id} />
                    <span>
                      <LevelPill tone={r.resolved_at ? "mute" : info ? "violet" : "danger"}>{info ? "Info" : "Error"}</LevelPill>
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-[14px] font-semibold">{r.message}</p>
                      <p className="truncate text-[12.5px] text-mute">
                        {KINDS[r.kind] ?? r.kind}
                        {r.path && <span className="font-mono text-faint"> · {r.path}</span>}
                      </p>
                    </div>
                    <span className="flex items-center gap-2">
                      {r.resolved_at ? (
                        <span className="text-[12.5px] text-mute">Handled</span>
                      ) : (
                        <form action={resolveIncident.bind(null, r.id)}>
                          <button className="admin-press inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-[13px] font-semibold ring-1 ring-line-2 hover:bg-ink-3">Mark handled</button>
                        </form>
                      )}
                    </span>
                  </div>
                  {r.detail && (
                    <details className="group border-t border-line/60">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[12.5px] text-mute hover:text-bone [&::-webkit-details-marker]:hidden">
                        <span aria-hidden className="transition-transform duration-200 group-open:rotate-90">›</span>
                        <span className="group-open:hidden">Show the detail</span>
                        <span className="hidden group-open:inline">Hide the detail</span>
                      </summary>
                      <pre className="mx-4 mb-4 max-h-80 overflow-auto rounded-[12px] bg-ink-3 p-3 font-mono text-[12px] text-mute">{r.detail}</pre>
                    </details>
                  )}
                </li>
              );
            })}
            {!rows.length && <li className="px-4 py-8 text-center text-[14px] text-lime">{showAll ? "Nothing has gone wrong." : "Nothing open."}</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
