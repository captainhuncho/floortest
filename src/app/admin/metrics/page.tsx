import { q } from "@/lib/db";
import { fmtDuration } from "@/lib/stats";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** The beta's health in a handful of numbers: are receivers activating, acting fast, and coming back? */
export default async function Metrics() {
  const t = Date.now();
  const median = async (sql: string, ...a: number[]) =>
    (await q.get<{ m: number | null }>(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v) AS m FROM (${sql}) x`, ...a))?.m ?? null;

  const receivers = await q.count("SELECT COUNT(*) AS n FROM users");
  const activated = await q.count("SELECT COUNT(*) AS n FROM users u WHERE EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id)");
  const toFirstTrack = await median("SELECT MIN(t.created_at) - u.created_at AS v FROM users u JOIN tracks t ON t.user_id = u.id GROUP BY u.id, u.created_at");
  const toListen = await median("SELECT played_at - created_at AS v FROM tracks WHERE played_at IS NOT NULL AND created_at >= ?", t - 30 * DAY);
  const toDecide = await median("SELECT decided_at - created_at AS v FROM tracks WHERE decided_at IS NOT NULL AND created_at >= ?", t - 30 * DAY);
  const decided = await q.count("SELECT COUNT(*) AS n FROM tracks WHERE decision IS NOT NULL AND decided_at >= ?", t - 30 * DAY);
  const kept = await q.count("SELECT COUNT(*) AS n FROM tracks WHERE decision = 'kept' AND decided_at >= ?", t - 30 * DAY);
  const senders = await q.count("SELECT COUNT(*) AS n FROM senders");
  const returning = await q.count("SELECT COUNT(*) AS n FROM (SELECT sender_id FROM tracks GROUP BY sender_id HAVING COUNT(*) > 1) x");

  // Last 8 weeks, oldest first: active receivers (did anything on their desk) and tracks received.
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const from = t - (i + 1) * WEEK;
    const to = t - i * WEEK;
    weeks.push({
      label: new Date(from).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      active: await q.count("SELECT COUNT(DISTINCT user_id) AS n FROM account_log WHERE created_at >= ? AND created_at < ?", from, to),
      tracks: await q.count("SELECT COUNT(*) AS n FROM tracks WHERE created_at >= ? AND created_at < ?", from, to),
    });
  }
  const peak = Math.max(1, ...weeks.map((w) => Math.max(w.active, w.tracks)));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  const dur = (ms: number | null) => (ms == null ? "–" : fmtDuration(ms));

  const cards = [
    ["Activated", pct(activated, receivers), `${activated} of ${receivers} receivers got a first track`],
    ["Sign-up → first track", dur(toFirstTrack), "median"],
    ["Delivery → first listen", dur(toListen), "median, last 30 days"],
    ["Delivery → decision", dur(toDecide), "median, last 30 days"],
    ["Keep rate", pct(kept, decided), `${kept} kept of ${decided} decided, last 30 days`],
    ["Returning senders", pct(returning, senders), `${returning} of ${senders} sent more than once`],
  ];

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-bold tracking-tight">Beta metrics</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([k, v, sub]) => (
          <li key={k} className="card p-5">
            <p className="label">{k}</p>
            <p className="mt-2 text-3xl font-bold tnum">{v}</p>
            <p className="mt-1 text-sm text-mute">{sub}</p>
          </li>
        ))}
      </ul>
      <section>
        <h2 className="text-lg font-semibold">Last 8 weeks</h2>
        <p className="mt-1 text-sm text-mute">
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-lime" /> Active receivers <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-sm bg-bone/40" /> Tracks received
        </p>
        <div className="mt-4 grid grid-cols-8 items-end gap-2" style={{ height: 180 }}>
          {weeks.map((w) => (
            <div key={w.label} className="flex h-full flex-col justify-end">
              <div className="flex flex-1 items-end justify-center gap-1">
                <div title={`${w.active} active`} className="w-1/3 rounded-sm bg-lime" style={{ height: `${(w.active / peak) * 100}%`, minHeight: w.active ? 3 : 0 }} />
                <div title={`${w.tracks} tracks`} className="w-1/3 rounded-sm bg-bone/40" style={{ height: `${(w.tracks / peak) * 100}%`, minHeight: w.tracks ? 3 : 0 }} />
              </div>
              <p className="mt-2 text-center text-xs text-mute">{w.label}</p>
              <p className="text-center text-xs tnum">
                {w.active} · {w.tracks}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
