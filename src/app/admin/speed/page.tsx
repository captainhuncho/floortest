import { q } from "@/lib/db";

const DAY = 86_400_000;
const GOOD = 200;
const POOR = 500;

export const metadata = { title: "Tap speed — FloorTest admin" };

/** How fast the screen responds to taps for real visitors (an INP-style measure that works in Safari too). */
export default async function Speed({ searchParams }: { searchParams: Promise<{ device?: string }> }) {
  const device = (await searchParams).device;
  const dev = device === "phone" || device === "desktop" || device === "tablet" ? device : null;
  const since = Date.now() - 7 * DAY;
  const where = `created_at > ?${dev ? " AND device = ?" : ""}`;
  const args = dev ? [since, dev] : [since];
  const total = await q.get<{ n: number; p75: number | null; slow: number }>(
    `SELECT COUNT(*)::int AS n, percentile_cont(0.75) WITHIN GROUP (ORDER BY ms) AS p75, COUNT(CASE WHEN ms > ${GOOD} THEN 1 END)::int AS slow FROM tap_timings WHERE ${where}`,
    ...args,
  );
  const pages = await q.all<{ path: string; n: number; p75: number; worst: number }>(
    `SELECT path, COUNT(*)::int AS n, percentile_cont(0.75) WITHIN GROUP (ORDER BY ms) AS p75, MAX(ms) AS worst
     FROM tap_timings WHERE ${where} GROUP BY path HAVING COUNT(*) >= 3 ORDER BY p75 DESC LIMIT 30`,
    ...args,
  );
  const targets = await q.all<{ path: string; target: string; n: number; p75: number }>(
    `SELECT path, target, COUNT(*)::int AS n, percentile_cont(0.75) WITHIN GROUP (ORDER BY ms) AS p75
     FROM tap_timings WHERE ${where} GROUP BY path, target HAVING COUNT(*) >= 3 ORDER BY p75 DESC LIMIT 15`,
    ...args,
  );
  const tone = (ms: number) => (ms <= GOOD ? "text-lime" : ms <= POOR ? "text-[#ffb648]" : "text-danger");
  const verdict = (ms: number) => (ms <= GOOD ? "Good" : ms <= POOR ? "Needs work" : "Poor");
  const p75 = Math.round(Number(total?.p75 ?? 0));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tap speed</h1>
        <p className="mt-2 max-w-2xl text-mute">
          How long the screen takes to respond after a tap or key press, from real visitors over the last 7 days. Under {GOOD} ms feels instant; over {POOR} ms
          feels broken. The 75th percentile is the number that matters: three in four taps are at least this fast. No accounts, IP addresses or item names are
          stored, and records are deleted after 30 days.
        </p>
      </div>
      <nav aria-label="Device" className="flex flex-wrap gap-2">
        {[
          [null, "All devices"],
          ["phone", "Phones"],
          ["tablet", "Tablets"],
          ["desktop", "Desktop"],
        ].map(([d, l]) => (
          <a key={l} href={d ? `/admin/speed?device=${d}` : "/admin/speed"} aria-current={dev === d ? "page" : undefined} className={`chip ${dev === d ? "border-lime/60 text-lime" : "border-line text-mute"}`}>
            {l}
          </a>
        ))}
      </nav>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-line p-4">
          <p className="label">75th percentile</p>
          <p className={`mt-1 text-2xl font-bold tnum ${total?.n ? tone(p75) : ""}`}>{total?.n ? `${p75} ms` : "—"}</p>
          <p className="mt-1 text-xs text-mute">{total?.n ? verdict(p75) : "No taps recorded yet"}</p>
        </div>
        <div className="rounded-md border border-line p-4">
          <p className="label">Taps measured</p>
          <p className="mt-1 text-2xl font-bold tnum">{total?.n ?? 0}</p>
          <p className="mt-1 text-xs text-mute">Up to 30 per page view</p>
        </div>
        <div className="rounded-md border border-line p-4">
          <p className="label">Slower than {GOOD} ms</p>
          <p className="mt-1 text-2xl font-bold tnum">{total?.n ? `${Math.round(((total.slow ?? 0) / total.n) * 100)}%` : "—"}</p>
          <p className="mt-1 text-xs text-mute">{total?.slow ?? 0} taps</p>
        </div>
      </div>
      <section aria-labelledby="pages-h" className="space-y-3">
        <h2 id="pages-h" className="text-lg font-semibold">By page, slowest first</h2>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead className="text-left text-mute">
              <tr>
                <th className="px-3 py-2 font-medium">Page</th>
                <th className="px-3 py-2 text-right font-medium">Taps</th>
                <th className="px-3 py-2 text-right font-medium">75th pct</th>
                <th className="px-3 py-2 text-right font-medium">Worst</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pages.map((p) => (
                <tr key={p.path}>
                  <td className="px-3 py-2 font-mono text-xs">{p.path}</td>
                  <td className="px-3 py-2 text-right tnum">{p.n}</td>
                  <td className={`px-3 py-2 text-right tnum ${tone(Number(p.p75))}`}>{Math.round(Number(p.p75))} ms</td>
                  <td className="px-3 py-2 text-right tnum text-mute">{p.worst} ms</td>
                </tr>
              ))}
              {!pages.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-mute">
                    Not enough taps yet. A page shows once it has 3 or more.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {targets.length > 0 && (
        <section aria-labelledby="targets-h" className="space-y-3">
          <h2 id="targets-h" className="text-lg font-semibold">Slowest controls</h2>
          <ul className="divide-y divide-line rounded-md border border-line">
            {targets.map((t) => (
              <li key={t.path + t.target} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{t.target || "page"}</span> <span className="font-mono text-xs text-mute">{t.path}</span>
                </span>
                <span className={`tnum ${tone(Number(t.p75))}`}>
                  {Math.round(Number(t.p75))} ms <span className="text-mute">· {t.n} taps</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
