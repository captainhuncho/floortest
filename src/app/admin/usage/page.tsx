import { q } from "@/lib/db";
import { FEATURES_USED, type FeatureUsed } from "@/lib/usage";

export const metadata = { title: "Feature use — FloorTest admin" };

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

type Row = { feature: string; people: number; uses: number };

/** Which parts of FloorTest people actually use, last 30 days against the 30 before. Counts only; no content. */
export default async function Usage() {
  const t = Date.now();
  const [from, mid] = [isoDay(t - 60 * DAY), isoDay(t - 30 * DAY)];
  const period = (a: string, b: string | null) =>
    q.all<Row>(
      `SELECT feature, COUNT(DISTINCT user_id)::int AS people, SUM(uses)::int AS uses FROM feature_use WHERE day >= ?${b ? " AND day < ?" : ""} GROUP BY feature`,
      ...(b ? [a, b] : [a]),
    );
  const [now, before] = await Promise.all([period(mid, null), period(from, mid)]);
  const active = await q.count("SELECT COUNT(DISTINCT user_id) AS n FROM feature_use WHERE day >= ?", mid);
  const prev = new Map(before.map((r) => [r.feature, r]));
  const rows = (Object.keys(FEATURES_USED) as FeatureUsed[])
    .map((f) => ({ f, cur: now.find((r) => r.feature === f), old: prev.get(f) }))
    .sort((a, b) => (b.cur?.people ?? 0) - (a.cur?.people ?? 0) || (b.cur?.uses ?? 0) - (a.cur?.uses ?? 0));

  // Queue vs List: the view each person used most this month.
  const views = await q.all<{ user_id: number; feature: string; uses: number }>(
    "SELECT user_id, feature, SUM(uses)::int AS uses FROM feature_use WHERE day >= ? AND feature IN ('review_queue', 'review_list') GROUP BY user_id, feature",
    mid,
  );
  const prefer = new Map<number, { q: number; l: number }>();
  for (const v of views) {
    const p = prefer.get(v.user_id) ?? { q: 0, l: 0 };
    if (v.feature === "review_queue") p.q += v.uses;
    else p.l += v.uses;
    prefer.set(v.user_id, p);
  }
  const prefQueue = [...prefer.values()].filter((p) => p.q >= p.l).length;
  const prefList = prefer.size - prefQueue;
  const switched = [...prefer.values()].filter((p) => p.q > 0 && p.l > 0).length;
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Feature use</h1>
        <p className="mt-2 max-w-2xl text-mute">
          Which parts of FloorTest people use, over the last 30 days, compared with the 30 days before. Counted per account per day, with no content; admins
          viewing someone&apos;s desk aren&apos;t counted. {active} account{active === 1 ? "" : "s"} active in the last 30 days.
        </p>
      </div>

      <section aria-labelledby="view-h" className="space-y-3">
        <h2 id="view-h" className="text-lg font-semibold">
          Queue or List
        </h2>
        {prefer.size ? (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-line" role="img" aria-label={`${pct(prefQueue, prefer.size)}% mostly use Queue, ${pct(prefList, prefer.size)}% mostly use List`}>
              <div className="bg-lime" style={{ width: `${pct(prefQueue, prefer.size)}%` }} />
              <div className="bg-mute" style={{ width: `${pct(prefList, prefer.size)}%` }} />
            </div>
            <p className="text-sm text-mute">
              <span className="text-lime">Queue {pct(prefQueue, prefer.size)}%</span> ({prefQueue}) · <span className="text-bone">List {pct(prefList, prefer.size)}%</span> ({prefList}) ·{" "}
              {switched} of {prefer.size} used both
            </p>
          </>
        ) : (
          <p className="text-sm text-mute">No one has opened the Review Queue in the last 30 days yet.</p>
        )}
      </section>

      <section aria-labelledby="all-h" className="space-y-3">
        <h2 id="all-h" className="text-lg font-semibold">
          Every feature, most used first
        </h2>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead className="text-left text-mute">
              <tr>
                <th className="px-3 py-2 font-medium">Feature</th>
                <th className="px-3 py-2 text-right font-medium">People</th>
                <th className="px-3 py-2 text-right font-medium">Share of active</th>
                <th className="px-3 py-2 text-right font-medium">Uses</th>
                <th className="px-3 py-2 text-right font-medium">vs previous 30 days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ f, cur, old }) => {
                const people = cur?.people ?? 0;
                const diff = people - (old?.people ?? 0);
                return (
                  <tr key={f} className={people ? "" : "text-faint"}>
                    <td className="px-3 py-2">{FEATURES_USED[f]}</td>
                    <td className="px-3 py-2 text-right tnum">{people}</td>
                    <td className="px-3 py-2 text-right tnum">{pct(people, active)}%</td>
                    <td className="px-3 py-2 text-right tnum">{cur?.uses ?? 0}</td>
                    <td className={`px-3 py-2 text-right tnum ${diff > 0 ? "text-lime" : diff < 0 ? "text-danger" : "text-mute"}`}>
                      {diff > 0 ? `+${diff}` : diff < 0 ? diff : "—"} {diff !== 0 && (Math.abs(diff) === 1 ? "person" : "people")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-faint">Unused features stay in the list, greyed out, so you can see what nobody touches.</p>
      </section>
    </div>
  );
}
