import { q } from "@/lib/db";

const DAY = 86_400_000;

export const metadata = { title: "Speed — FloorTest admin" };

/** Thresholds per measure: taps should feel instant; page changes and first loads follow the web's 1 s / 2.5 s norms. */
const KINDS = {
  tap: { title: "Taps", what: "From a tap or key press to the screen reacting.", good: 200, poor: 500, by: "Page" },
  nav: { title: "Page changes", what: "From tapping a link to the next page showing, inside the app.", good: 1000, poor: 2500, by: "Destination page" },
  load: { title: "First load", what: "From opening a page fresh (a link, a bookmark, a reload) to its first content on screen.", good: 1800, poor: 3000, by: "Page" },
} as const;
type Kind = keyof typeof KINDS;

const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/** How fast FloorTest feels for real visitors, from the TapSpeed reporter. Works in Safari too. */
export default async function Speed({ searchParams }: { searchParams: Promise<{ device?: string }> }) {
  const device = (await searchParams).device;
  const dev = device === "phone" || device === "desktop" || device === "tablet" ? device : null;
  const since = Date.now() - 7 * DAY;
  const where = `kind = ? AND created_at > ?${dev ? " AND device = ?" : ""}`;
  const args = (k: Kind) => (dev ? [k, since, dev] : [k, since]);

  const data = await Promise.all(
    (Object.keys(KINDS) as Kind[]).map(async (k) => {
      const K = KINDS[k];
      const total = await q.get<{ n: number; p75: number | null; slow: number }>(
        `SELECT COUNT(*)::int AS n, percentile_cont(0.75) WITHIN GROUP (ORDER BY ms) AS p75, COUNT(CASE WHEN ms > ${K.good} THEN 1 END)::int AS slow FROM tap_timings WHERE ${where}`,
        ...args(k),
      );
      const pages = await q.all<{ path: string; n: number; p75: number; worst: number }>(
        `SELECT path, COUNT(*)::int AS n, percentile_cont(0.75) WITHIN GROUP (ORDER BY ms) AS p75, MAX(ms) AS worst
         FROM tap_timings WHERE ${where} GROUP BY path HAVING COUNT(*) >= 3 ORDER BY p75 DESC LIMIT 20`,
        ...args(k),
      );
      const targets =
        k === "tap"
          ? await q.all<{ path: string; target: string; n: number; p75: number }>(
              `SELECT path, target, COUNT(*)::int AS n, percentile_cont(0.75) WITHIN GROUP (ORDER BY ms) AS p75
               FROM tap_timings WHERE ${where} GROUP BY path, target HAVING COUNT(*) >= 3 ORDER BY p75 DESC LIMIT 10`,
              ...args(k),
            )
          : [];
      return { k, K, total, pages, targets };
    }),
  );
  const tone = (ms: number, K: (typeof KINDS)[Kind]) => (ms <= K.good ? "text-lime" : ms <= K.poor ? "text-[#ffb648]" : "text-danger");
  const verdict = (ms: number, K: (typeof KINDS)[Kind]) => (ms <= K.good ? "Good" : ms <= K.poor ? "Needs work" : "Poor");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Speed</h1>
        <p className="mt-2 max-w-2xl text-mute">
          How fast FloorTest feels for real visitors over the last 7 days. Each number is the 75th percentile: three in four are at least this fast. No accounts,
          IP addresses or item names are stored, and records are deleted after 30 days.
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
        {data.map(({ k, K, total }) => {
          const p75 = Number(total?.p75 ?? 0);
          return (
            <a key={k} href={`#${k}`} className="rounded-md border border-line p-4 hover:border-mute">
              <p className="label">{K.title}</p>
              <p className={`mt-1 text-2xl font-bold tnum ${total?.n ? tone(p75, K) : ""}`}>{total?.n ? fmt(p75) : "—"}</p>
              <p className="mt-1 text-xs text-mute">
                {total?.n ? `${verdict(p75, K)} · ${total.n} measured · ${Math.round(((total.slow ?? 0) / total.n) * 100)}% over ${fmt(K.good)}` : "Nothing measured yet"}
              </p>
            </a>
          );
        })}
      </div>

      {data.map(({ k, K, pages, targets }) => (
        <section key={k} id={k} aria-labelledby={`${k}-h`} className="space-y-3">
          <div>
            <h2 id={`${k}-h`} className="text-lg font-semibold">
              {K.title}, slowest first
            </h2>
            <p className="text-sm text-mute">
              {K.what} Good under {fmt(K.good)}; poor over {fmt(K.poor)}.
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead className="text-left text-mute">
                <tr>
                  <th className="px-3 py-2 font-medium">{K.by}</th>
                  <th className="px-3 py-2 text-right font-medium">Count</th>
                  <th className="px-3 py-2 text-right font-medium">75th pct</th>
                  <th className="px-3 py-2 text-right font-medium">Worst</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pages.map((p) => (
                  <tr key={p.path}>
                    <td className="px-3 py-2 font-mono text-xs">{p.path}</td>
                    <td className="px-3 py-2 text-right tnum">{p.n}</td>
                    <td className={`px-3 py-2 text-right tnum ${tone(Number(p.p75), K)}`}>{fmt(Number(p.p75))}</td>
                    <td className="px-3 py-2 text-right tnum text-mute">{fmt(Number(p.worst))}</td>
                  </tr>
                ))}
                {!pages.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-mute">
                      Not enough data yet. A page shows once it has 3 or more.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {targets.length > 0 && (
            <ul className="divide-y divide-line rounded-md border border-line">
              {targets.map((t) => (
                <li key={t.path + t.target} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{t.target || "page"}</span> <span className="font-mono text-xs text-mute">{t.path}</span>
                  </span>
                  <span className={`tnum ${tone(Number(t.p75), K)}`}>
                    {fmt(Number(t.p75))} <span className="text-mute">· {t.n} taps</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
