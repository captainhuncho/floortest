import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { q } from "@/lib/db";
import { ConfirmButton } from "../AdminUi";
import { resolveAllIncidents, resolveIncident } from "../actions";

const KINDS: Record<string, string> = {
  server_error: "Server error",
  upload_failed: "Upload failed",
  upload_rejected: "Upload refused",
  cron_failed: "Scheduled job failed",
  email_failed: "Email failed",
};
/** A visitor's file being refused is information, not a fault: it never goes on the to-do list. */
const INFO = new Set(["upload_rejected"]);

/** Everything that went wrong, newest first. Open ones count on the Overview until they're marked handled. */
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
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
          <p className="mt-2 text-mute">
            {open ? `${open} open.` : "Nothing open."} Mark each one handled once it&apos;s dealt with; refused uploads are kept for reference only.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={link(filter, !showAll)} className="btn-ghost btn-sm">{showAll ? "Open only" : "Show handled too"}</Link>
          {rows.some((r) => !r.resolved_at) && (
            <ConfirmButton
              action={resolveAllIncidents.bind(null, filter ?? "")}
              message={`Mark every open ${filter ? `"${KINDS[filter]}" ` : ""}incident as handled?`}
              confirmLabel="Mark all handled"
              className="btn-ghost btn-sm"
            >
              Mark all handled
            </ConfirmButton>
          )}
        </div>
      </div>
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filter">
        <Link href={link(null)} className={`chip ${!filter ? "border-bone text-bone" : "border-line text-mute"}`}>All</Link>
        {Object.entries(KINDS).map(([k, label]) => (
          <Link key={k} href={link(k)} className={`chip ${filter === k ? "border-bone text-bone" : n(k) && !INFO.has(k) ? "border-danger/50 text-danger" : "border-line text-mute"}`}>
            {label} · {n(k)}
          </Link>
        ))}
      </nav>
      <ul className="mt-6 space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <details className={`rounded-md border border-line ${r.resolved_at ? "opacity-60" : ""}`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <span>
                  <span className={`chip mr-2 ${INFO.has(r.kind) || r.resolved_at ? "border-line text-mute" : "border-danger/40 text-danger"}`}>{KINDS[r.kind] ?? r.kind}</span>
                  {r.message}
                  {r.path && <span className="ml-2 text-xs text-mute">{r.path}</span>}
                </span>
                <span className="flex items-center gap-3 text-sm text-mute">
                  {new Date(r.created_at).toLocaleString("en-GB")}
                  {r.resolved_at ? (
                    <span>Handled</span>
                  ) : (
                    <form action={resolveIncident.bind(null, r.id)}>
                      <button className="text-bone underline">Mark handled</button>
                    </form>
                  )}
                </span>
              </summary>
              {r.detail && <pre className="overflow-x-auto border-t border-line px-4 py-3 text-xs text-mute">{r.detail}</pre>}
            </details>
          </li>
        ))}
        {!rows.length && <li className="rounded-md border border-line px-4 py-6 text-center text-lime">{showAll ? "Nothing has gone wrong." : "Nothing open. 🎛️"}</li>}
      </ul>
    </div>
  );
}
