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

  // Funnel over the last 30 days: from wanting in to the first real listen.
  const since = t - 30 * DAY;
  const funnel: [string, number][] = [
    ["Joined the waitlist", await q.count("SELECT COUNT(*) AS n FROM waitlist WHERE created_at >= ?", since)],
    ["Invited", await q.count("SELECT COUNT(*) AS n FROM invites WHERE created_at >= ?", since)],
    ["Signed up", await q.count("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", since)],
    ["Got a first track", await q.count("SELECT COUNT(*) AS n FROM users u WHERE u.created_at >= ? AND EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id)", since)],
    ["Listened to one", await q.count("SELECT COUNT(*) AS n FROM users u WHERE u.created_at >= ? AND EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id AND t.played_at IS NOT NULL)", since)],
  ];
  const top = Math.max(1, ...funnel.map(([, n]) => n));
  // Uploads over the last 48 hours (attempts are only kept that long): started, delivered, refused.
  const recent = t - 2 * DAY;
  const started = await q.count("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = 'upload_ip' AND created_at >= ?", recent);
  const delivered = await q.count("SELECT COUNT(*) AS n FROM tracks WHERE created_at >= ?", recent);
  const refused = await q.count("SELECT COUNT(*) AS n FROM incidents WHERE kind = 'upload_rejected' AND created_at >= ?", recent);
  const sources = await q.all<{ source: string; n: number }>(
    `SELECT source, COUNT(*)::int AS n FROM (
       SELECT source FROM waitlist WHERE source <> '' AND created_at >= ? UNION ALL SELECT signup_source FROM users WHERE signup_source <> '' AND created_at >= ?
     ) s GROUP BY source ORDER BY n DESC LIMIT 6`,
    since,
    since,
  );
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
      <section aria-labelledby="funnel-h" className="space-y-3">
        <h2 id="funnel-h" className="text-lg font-semibold">Funnel, last 30 days</h2>
        <ul className="space-y-2">
          {funnel.map(([label, n], i) => (
            <li key={label} className="grid grid-cols-[12rem_1fr_6rem] items-center gap-3 text-sm">
              <span>{label}</span>
              <span className="h-2 rounded-full bg-ink-3"><span className="block h-2 rounded-full bg-lime" style={{ width: `${(n / top) * 100}%` }} /></span>
              <span className="text-right tnum">{n}{i > 0 && funnel[i - 1][1] ? <span className="text-mute"> · {pct(n, funnel[i - 1][1])}</span> : null}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-mute">
          Uploads, last 48 hours: {started} started · {delivered} delivered ({pct(delivered, started)}) · {refused} refused (see Incidents → Upload refused).
          {sources.length ? ` Top sources: ${sources.map((s) => `${s.source} (${s.n})`).join(", ")}.` : ""} Website visits are in Vercel → Analytics.
        </p>
      </section>
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
