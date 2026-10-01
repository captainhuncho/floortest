import Link from "next/link";
import { q } from "@/lib/db";

const KINDS: Record<string, string> = {
  server_error: "Server error",
  upload_failed: "Upload failed",
  cron_failed: "Scheduled job failed",
  email_failed: "Email failed",
};

/** Everything that went wrong, newest first. */
export default async function Incidents({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const kind = (await searchParams).kind;
  const filter = kind && KINDS[kind] ? kind : null;
  const rows = await q.all<{ id: number; kind: string; message: string; detail: string; path: string; created_at: number }>(
    `SELECT * FROM incidents ${filter ? "WHERE kind = ?" : ""} ORDER BY created_at DESC LIMIT 200`,
    ...(filter ? [filter] : []),
  );
  const counts = await q.all<{ kind: string; n: number }>("SELECT kind, COUNT(*) AS n FROM incidents WHERE created_at >= ? GROUP BY kind", Date.now() - 7 * 86_400_000);
  const n = (k: string) => counts.find((c) => c.kind === k)?.n ?? 0;
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
      <p className="mt-2 text-mute">Server errors, failed uploads, failed emails and scheduled-job failures. Counts are the last 7 days.</p>
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filter">
        <Link href="/admin/incidents" className={`chip ${!filter ? "border-bone text-bone" : "border-line text-mute"}`}>All</Link>
        {Object.entries(KINDS).map(([k, label]) => (
          <Link key={k} href={`/admin/incidents?kind=${k}`} className={`chip ${filter === k ? "border-bone text-bone" : n(k) ? "border-danger/50 text-danger" : "border-line text-mute"}`}>
            {label} · {n(k)}
          </Link>
        ))}
      </nav>
      <ul className="mt-6 space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <details className="rounded-md border border-line">
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <span>
                  <span className="chip mr-2 border-danger/40 text-danger">{KINDS[r.kind] ?? r.kind}</span>
                  {r.message}
                  {r.path && <span className="ml-2 text-xs text-mute">{r.path}</span>}
                </span>
                <span className="text-sm text-mute">{new Date(r.created_at).toLocaleString("en-GB")}</span>
              </summary>
              {r.detail && <pre className="overflow-x-auto border-t border-line px-4 py-3 text-xs text-mute">{r.detail}</pre>}
            </details>
          </li>
        ))}
        {!rows.length && <li className="rounded-md border border-line px-4 py-6 text-center text-lime">Nothing has gone wrong. 🎛️</li>}
      </ul>
    </div>
  );
}
