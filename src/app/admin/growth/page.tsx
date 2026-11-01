import { can, requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { KIND_LABEL, now as clock, q } from "@/lib/db";
import { allPlans, FREE_PLAN } from "@/lib/plan-store";
import { env } from "@/lib/env";
import {
  BETA_START,
  BETA_TARGETS,
  BETA_WEEKS,
  betaNumbers,
  decisions,
  forecast,
  formatHours,
  funnel,
  showShare,
  type BetaAccountRow,
  type BetaActivityRow,
  type BetaNumbers,
  type BetaTrackRow,
  type Card,
  type Group,
  type Point,
} from "@/lib/growth";
import { MonoStat } from "../PinParts";

export const metadata = { title: "Growth & decisions — FloorTest ops" };

const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** Weeks of history behind the trend and the projection. */
const WEEKS = 12;
/** The funnel, sources and types look at people who joined in this window. */
const WINDOW_DAYS = 90;
/** Weekly sign-up groups shown in the "do they stay" grid. */
const COHORTS = 8;

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const num = (v: unknown) => Number(v ?? 0);

/**
 * Growth & decisions (owner, 1 Nov 2026): where people come from, where they drop off, whether they stay, what's
 * likely next, and plain findings to act on. Built on FloorTest's own data only; nothing here needs outside analytics.
 */
export default async function Growth() {
  const me = await requireAdmin("metrics");
  const money = can(me.access, "revenue");
  const t = clock();
  const from = t - WEEKS * WEEK;
  const since = t - WINDOW_DAYS * DAY;
  const cohortFrom = t - COHORTS * WEEK;
  const week = (col: string) => `FLOOR((${col} - ?) / ${WEEK})`;
  const betaRows = loadBeta();

  const [signupWeeks, trackWeeks, steps, sourceRows, kindRows, cohortUsers, requests, plans, payers] = await Promise.all([
    q.all<{ w: number; n: number }>(`SELECT ${week("created_at")} AS w, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY 1`, from, from),
    q.all<{ w: number; n: number }>(`SELECT ${week("created_at")} AS w, COUNT(*) AS n FROM tracks WHERE created_at >= ? GROUP BY 1`, from, from),
    q.get<{ waitlist: number; invited: number; joined: number; tracked: number; kept: number; paid: number }>(
      `SELECT
         (SELECT COUNT(*) FROM waitlist WHERE created_at >= ?) AS waitlist,
         (SELECT COUNT(*) FROM waitlist WHERE invited_at >= ?) AS invited,
         (SELECT COUNT(*) FROM users WHERE created_at >= ?) AS joined,
         (SELECT COUNT(*) FROM users u WHERE u.created_at >= ? AND EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id)) AS tracked,
         (SELECT COUNT(*) FROM users u WHERE u.created_at >= ? AND EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id AND t.decision = 'kept')) AS kept,
         (SELECT COUNT(*) FROM users WHERE created_at >= ? AND plan <> ?) AS paid`,
      since, since, since, since, since, since, FREE_PLAN,
    ),
    q.all<{ name: string; people: number; activated: number; paid: number }>(
      `SELECT COALESCE(NULLIF(split_part(u.signup_source, ' / ', 1), ''), 'Unknown') AS name, COUNT(*) AS people,
         COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id)) AS activated,
         COUNT(*) FILTER (WHERE u.plan <> ?) AS paid
       FROM users u WHERE u.created_at >= ? GROUP BY 1 ORDER BY people DESC LIMIT 12`,
      FREE_PLAN, since,
    ),
    q.all<{ kind: string | null; people: number; activated: number; paid: number }>(
      `SELECT u.kind, COUNT(*) AS people,
         COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id)) AS activated,
         COUNT(*) FILTER (WHERE u.plan <> ?) AS paid
       FROM users u WHERE u.created_at >= ? GROUP BY 1`,
      FREE_PLAN, since,
    ),
    // Each recent sign-up with the weeks (since joining) in which they listened or decided on a track.
    q.all<{ id: number; created_at: number; weeks: number[] | null }>(
      `SELECT u.id, u.created_at,
         ARRAY(SELECT DISTINCT FLOOR((COALESCE(t.decided_at, t.played_at) - u.created_at) / ${WEEK})::int FROM tracks t
               WHERE t.user_id = u.id AND COALESCE(t.decided_at, t.played_at) >= u.created_at) AS weeks
       FROM users u WHERE u.created_at >= ? ORDER BY u.created_at LIMIT 5000`,
      cohortFrom,
    ),
    q.all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM plan_requests WHERE created_at >= ? GROUP BY status", since),
    money ? allPlans() : Promise.resolve([]),
    money ? q.all<{ plan: string; n: number }>("SELECT plan, COUNT(*) AS n FROM users WHERE plan <> ? AND suspended_at IS NULL GROUP BY plan", FREE_PLAN) : Promise.resolve([]),
  ]);

  const [betaAccounts, betaActivity, betaTracks] = await betaRows;
  const beta = betaNumbers({ now: t, adminEmails: env.adminEmails, accounts: betaAccounts, activity: betaActivity, tracks: betaTracks });

  const series = (rows: { w: number; n: number }[]) => Array.from({ length: WEEKS }, (_, i) => num(rows.find((r) => num(r.w) === i)?.n));
  const signups = series(signupWeeks);
  const tracks = series(trackWeeks);
  const nextSignups = forecast(signups);
  const nextTracks = forecast(tracks);
  const flow = funnel([
    { label: "Joined the waitlist", n: num(steps?.waitlist) },
    { label: "Invited", n: num(steps?.invited) },
    { label: "Signed up", n: num(steps?.joined) },
    { label: "Got a track", n: num(steps?.tracked) },
    { label: "Kept a track", n: num(steps?.kept) },
    { label: "Pays", n: num(steps?.paid) },
  ]);
  const sources: Group[] = sourceRows.map((r) => ({ name: r.name, people: num(r.people), activated: num(r.activated), paid: num(r.paid) }));
  const kinds: Group[] = kindRows.map((r) => ({ name: KIND_LABEL[r.kind ?? ""] ?? "Not set", people: num(r.people), activated: num(r.activated), paid: num(r.paid) }));
  const cards = decisions({ steps: flow.slice(2), sources, kinds, signups, next: nextSignups });

  // "Do they stay?": for each weekly group of sign-ups, the share active in each week since they joined.
  const cohorts = Array.from({ length: COHORTS }, (_, c) => {
    const start = cohortFrom + c * WEEK;
    const people = cohortUsers.filter((u) => num(u.created_at) >= start && num(u.created_at) < start + WEEK);
    const age = Math.floor((t - start) / WEEK);
    return {
      label: new Date(start).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
      size: people.length,
      cells: Array.from({ length: COHORTS }, (_, k) => (k > age ? null : pct(people.filter((u) => (u.weeks ?? []).map(Number).includes(k)).length, people.length))),
    };
  });

  const stage = (s: string) => num(requests.find((r) => r.status === s)?.n);
  const price = (id: string) => plans.find((p) => p.id === id)?.price ?? 0;
  const mrr = payers.reduce((sum, r) => sum + price(r.plan) * num(r.n), 0);
  const tone: Record<Card["tone"], string> = { good: "bg-lime text-ink", watch: "bg-[#c9c1ff] text-[#16123a]", act: "bg-[#f7b6a8] text-[#2a1410]" };
  const P = "admin-panel admin-rise p-5";
  const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

  return (
    <div className="space-y-6">
      <header className="admin-rise">
        <span className="rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-bone ring-1 ring-line-2">Growth & decisions</span>
        <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[40px]">What&apos;s working, and what to do next</h1>
        <p className="mt-1 text-[15px] text-mute">From FloorTest&apos;s own numbers: people who joined in the last {WINDOW_DAYS} days, and the last {WEEKS} weeks of activity.</p>
      </header>

      <BetaSection n={beta} />

      {/* Findings first (decision cards), each with the counts behind it. */}
      <section aria-labelledby="dec-h" className={P} style={i(1)}>
        <h2 id="dec-h" className="text-[16px] font-semibold">Findings</h2>
        {cards.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((c, n) => (
              <li key={c.title} className={`admin-rise rounded-[18px] p-4 ${tone[c.tone]}`} style={i(2 + n)}>
                <p className="text-[15px] font-semibold leading-snug">{c.title}</p>
                <p className="mt-2 text-[13px] leading-relaxed opacity-80">{c.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[14px] text-mute">Not enough activity yet to say anything useful. Findings appear once a few weeks of sign-ups and tracks come in.</p>
        )}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="fun-h" className={P} style={i(3)}>
          <h2 id="fun-h" className="text-[16px] font-semibold">From waitlist to paying</h2>
          <p className="text-[12.5px] text-faint">Last {WINDOW_DAYS} days · each bar is a share of the first step anyone reached</p>
          <ol className="mt-4 space-y-3">
            {flow.map((s, n) => (
              <li key={s.label}>
                <p className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span>{s.label}</span>
                  <span className="tnum">
                    <b className="font-semibold">{s.n.toLocaleString("en-GB")}</b>
                    {n > 0 &&
                      (s.ofPrev > 100 ? (
                        // People can skip steps (sign up without the waitlist, pay without keeping a track).
                        <span className="ml-2 text-[12px] text-faint">more than the step before</span>
                      ) : (
                        <span className={`ml-2 text-[12px] ${s.ofPrev < 50 ? "text-[var(--admin-amber)]" : "text-faint"}`}>{s.ofPrev}% of the step before</span>
                      ))}
                  </span>
                </p>
                <span aria-hidden className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-ink-4">
                  <span className={`admin-grow block h-full rounded-full ${n === flow.length - 1 ? "bg-lime" : "bg-[var(--admin-violet)]"}`} style={{ width: `${Math.min(100, Math.max(s.n ? 2 : 0, s.ofFirst))}%`, "--i": n } as React.CSSProperties} />
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="fc-h" className={P} style={i(4)}>
          <h2 id="fc-h" className="text-[16px] font-semibold">Sign-ups: last {WEEKS} weeks, and the next 4</h2>
          <p className="text-[12.5px] text-faint">The faint bars and their range are a projection, not a promise</p>
          <Projection past={signups} next={nextSignups} label="Sign-ups per week" />
          <p className="mt-3 text-[13px] text-mute">
            Tracks per week: about <b className="text-bone tnum">{nextTracks[0]?.value ?? "—"}</b> next week
            {nextTracks[0] && (
              <span className="text-faint tnum">
                {" "}
                (likely {nextTracks[0].low}–{nextTracks[0].high})
              </span>
            )}
            .
          </p>
        </section>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <GroupTable id="src" title="Where people come from" hint="Sign-up source (link tags or the site they came from)" rows={sources} order={4} />
        <GroupTable id="kind" title="Who they are" hint="Account type chosen at sign-up" rows={kinds} order={5} />
      </div>

      <section aria-labelledby="co-h" className={P} style={i(6)}>
        <h2 id="co-h" className="text-[16px] font-semibold">Do they stay?</h2>
        <p className="text-[12.5px] text-faint">Each row is a week of sign-ups; each cell, the share who listened to or decided on a track that many weeks after joining</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-1 text-[12px]">
            <thead>
              <tr className="text-faint">
                <th className="px-2 py-1 text-left font-medium">Joined</th>
                <th className="px-2 py-1 text-right font-medium">People</th>
                {Array.from({ length: COHORTS }, (_, k) => (
                  <th key={k} className="px-1 py-1 font-medium">
                    Week {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.label}>
                  <td className="whitespace-nowrap px-2 py-1">{c.label}</td>
                  <td className="px-2 py-1 text-right text-faint tnum">{c.size}</td>
                  {c.cells.map((v, k) => (
                    <td
                      key={k}
                      className="h-9 rounded-[8px] text-center font-semibold tnum"
                      style={v == null || !c.size ? undefined : { background: `color-mix(in srgb, var(--color-lime) ${Math.max(6, v)}%, var(--color-ink-3))`, color: v > 55 ? "var(--color-ink)" : undefined }}
                    >
                      {v == null || !c.size ? <span className="text-faint">·</span> : `${v}%`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="pipe-h" className={P} style={i(7)}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="pipe-h" className="text-[16px] font-semibold">Sales pipeline</h2>
          <Link href="/admin/plan-requests" className="min-h-11 content-center text-[12.5px] text-mute hover:text-bone">
            Plan requests ›
          </Link>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Asked for a plan", stage("pending"), "bg-[#ffd98a] text-[#2a2008]"],
            ["Approved", stage("approved"), "bg-lime text-ink"],
            ["Declined", stage("declined"), "bg-ink-3"],
            ["Withdrew", stage("withdrawn"), "bg-ink-3"],
          ].map(([label, n, cls], k) => (
            <li key={label as string} className={`admin-rise rounded-[16px] p-4 ${cls}`} style={i(8 + k)}>
              <p className="text-[28px] font-semibold leading-none tracking-[-0.02em] tnum">{n as number}</p>
              <p className="mt-1.5 text-[12.5px] opacity-80">{label as string}</p>
            </li>
          ))}
        </ul>
        {money && (
          <p className="mt-4 text-[13.5px] text-mute">
            Monthly revenue from current paid plans: <b className="text-bone tnum">${mrr.toLocaleString("en-US")}</b>
            <span className="text-faint"> · list prices, before any discounts</span>
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * The beta's rows in three queries: every account that could count (whenever it was made: invites went out before
 * 1 Nov), then submitted/decision events (events_time) and tracks with the sender's email (tracks_created), both
 * bounded to the beta start (1 Nov, UTC). Who counts and the maths are in lib/growth (betaNumbers), so they're tested
 * apart from the database.
 */
async function loadBeta(): Promise<[BetaAccountRow[], BetaActivityRow[], BetaTrackRow[]]> {
  const [accounts, activity, tracks] = await Promise.all([
    q.all<BetaAccountRow>(
      `SELECT u.id, lower(u.email) AS email, u.created_at, u.suspended_at,
         EXISTS (SELECT 1 FROM ops_members o WHERE o.user_id = u.id) AS ops,
         (COALESCE(u.invite_code, '') <> '' OR EXISTS (SELECT 1 FROM waitlist w WHERE w.invited_at IS NOT NULL AND lower(w.email) = lower(u.email))) AS invited,
         ARRAY(SELECT lower(m.email) FROM account_members am JOIN users m ON m.id = am.user_id WHERE am.account_id = u.id) AS team_emails
       FROM users u WHERE u.suspended_at IS NULL AND lower(u.email) NOT LIKE ? ORDER BY u.id LIMIT 50000`,
      "%@floortest.test",
    ),
    q.all<BetaActivityRow>(
      `SELECT e.user_id, e.type, COUNT(*) AS n, MAX(e.created_at) AS last_at
       FROM events e
       WHERE e.created_at >= ? AND e.type IN ('submitted', 'kept', 'passed')
       GROUP BY e.user_id, e.type`,
      BETA_START,
    ),
    q.all<BetaTrackRow>(
      `SELECT t.user_id, t.created_at, t.played_at, t.deleted_at, lower(s.email) AS sender_email
       FROM tracks t JOIN senders s ON s.id = t.sender_id
       WHERE t.created_at >= ? LIMIT 50000`,
      BETA_START,
    ),
  ]);
  // Postgres bigints can arrive as strings; the maths wants numbers.
  const n = (v: unknown) => (v == null ? null : Number(v));
  return [
    accounts.map((r) => ({ ...r, id: Number(r.id), created_at: Number(r.created_at), suspended_at: n(r.suspended_at), ops: !!r.ops, invited: !!r.invited, team_emails: (r.team_emails ?? []).map(String) })),
    activity.map((r) => ({ user_id: Number(r.user_id), type: String(r.type), n: Number(r.n), last_at: Number(r.last_at) })),
    tracks.map((r) => ({ ...r, user_id: Number(r.user_id), created_at: Number(r.created_at), played_at: n(r.played_at), deleted_at: n(r.deleted_at) })),
  ];
}

/** The beta's three weekly targets (docs/beta-launch-plan.md), as three tiles. Small bases show the raw number only. */
function BetaSection({ n }: { n: BetaNumbers }) {
  const share = showShare(n.accounts);
  // Under 5 accounts the base rule is raw count only: no share, no target, no bar.
  const of = (v: number, target: number) => (share ? `${pct(v, n.accounts)}% of ${n.accounts} beta accounts · target ${target} · ` : "");
  const toward = (v: number, target: number) => (share ? Math.min(100, (v / target) * 100) : undefined);
  const hours = n.firstListenHours;
  const fast = hours != null && hours < BETA_TARGETS.firstListenHours;
  const listenShare = showShare(n.listenAccounts);
  return (
    <section aria-labelledby="beta-h" className="admin-panel admin-rise p-5" style={{ "--i": 0 } as React.CSSProperties}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="beta-h" className="text-[16px] font-semibold">Beta numbers</h2>
        <p className="text-[13px] text-mute tnum">
          Beta week {n.week} of {BETA_WEEKS}
        </p>
      </div>
      <p className="mt-1 text-[12.5px] text-faint tnum">
        {n.accounts} beta {n.accounts === 1 ? "account" : "accounts"} · {n.invited} invited / {n.other} other · {n.joinedBefore} joined before 1 Nov / {n.joinedSince} since · activity counted from 1 Nov · not counting the owner, ops staff, test accounts or suspended accounts
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <MonoStat
          i={1}
          label="Weekly active receivers"
          value={`${n.weeklyActive}`}
          pct={toward(n.weeklyActive, BETA_TARGETS.weeklyActive)}
          tone={n.weeklyActive >= BETA_TARGETS.weeklyActive ? "lime" : "violet"}
          caption={`${of(n.weeklyActive, BETA_TARGETS.weeklyActive)}kept or passed a track in the last 7 days`}
        />
        <MonoStat
          i={2}
          label="Activated receivers"
          value={`${n.activated}`}
          pct={toward(n.activated, BETA_TARGETS.activated)}
          tone={n.activated >= BETA_TARGETS.activated ? "lime" : "violet"}
          caption={`${of(n.activated, BETA_TARGETS.activated)}got a track and made a decision`}
        />
        <MonoStat
          i={3}
          label="Time to first listen (median)"
          value={formatHours(hours)}
          pct={hours != null && listenShare ? Math.min(100, (hours / BETA_TARGETS.firstListenHours) * 100) : undefined}
          tone={fast ? "lime" : "amber"}
          caption={`${listenShare ? `target under ${BETA_TARGETS.firstListenHours} h · ` : ""}${n.listened} ${n.listened === 1 ? "track" : "tracks"} listened to · ${n.waiting} waiting for a first listen`}
        />
      </div>
    </section>
  );
}

/** Past weeks as bone bars, the next 4 as faint violet bars with their likely range drawn as a line. */
function Projection({ past, next, label }: { past: number[]; next: Point[]; label: string }) {
  const top = Math.max(1, ...past, ...next.map((p) => p.high));
  const all = [...past.map((v) => ({ v, p: null as Point | null })), ...next.map((p) => ({ v: p.value, p }))];
  return (
    <figure className="mt-4">
      <div className="flex h-[180px] items-end gap-1.5" role="img" aria-label={`${label}: ${past.join(", ")}. Next 4 weeks, projected: ${next.map((p) => `${p.value} (${p.low} to ${p.high})`).join(", ") || "not enough weeks yet"}.`}>
        {all.map(({ v, p }, k) => (
          <div key={k} className="relative flex h-full flex-1 flex-col justify-end">
            {p && <span aria-hidden className="absolute left-1/2 w-[2px] -translate-x-1/2 rounded bg-[var(--admin-violet)]" style={{ bottom: `${(p.low / top) * 100}%`, height: `${Math.max(1, ((p.high - p.low) / top) * 100)}%` }} />}
            <span
              className={`admin-grow-y block rounded-t-[7px] rounded-b-[3px] ${p ? "bg-[var(--admin-violet)]/35 ring-1 ring-[var(--admin-violet)]/60" : k === past.length - 1 ? "bg-lime" : "bg-bone/55"}`}
              style={{ height: `${Math.max(2, (v / top) * 100)}%`, "--i": k } as React.CSSProperties}
              title={p ? `Projected ${v} (likely ${p.low}–${p.high})` : `${v}`}
            />
          </div>
        ))}
      </div>
      <figcaption aria-hidden className="mt-2 flex justify-between text-[11px] text-faint">
        <span>{past.length} weeks ago</span>
        <span>this week</span>
        <span>+4 weeks</span>
      </figcaption>
    </figure>
  );
}

/** People per group with how many got a track and how many pay; small groups are marked so nobody over-reads them. */
function GroupTable({ id, title, hint, rows, order }: { id: string; title: string; hint: string; rows: Group[]; order: number }) {
  const top = Math.max(1, ...rows.map((r) => r.people));
  return (
    <section aria-labelledby={`${id}-h`} className="admin-panel admin-rise p-5" style={{ "--i": order } as React.CSSProperties}>
      <h2 id={`${id}-h`} className="text-[16px] font-semibold">{title}</h2>
      <p className="text-[12.5px] text-faint">{hint}</p>
      {rows.length ? (
        <table className="mt-3 w-full text-[13px]">
          <thead className="text-faint">
            <tr>
              <th className="py-1.5 text-left font-medium">Group</th>
              <th className="py-1.5 text-right font-medium">People</th>
              <th className="py-1.5 text-right font-medium">Got a track</th>
              <th className="py-1.5 text-right font-medium">Pay</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-line">
                <td className="py-2 pr-3">
                  <span className="block truncate">{r.name}</span>
                  <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-4">
                    <span className="admin-grow block h-full rounded-full bg-[var(--admin-violet)]" style={{ width: `${(r.people / top) * 100}%` }} />
                  </span>
                </td>
                <td className="py-2 text-right tnum">{r.people}</td>
                <td className="py-2 text-right tnum">{pct(r.activated, r.people)}%</td>
                <td className={`py-2 text-right font-semibold tnum ${r.people < 5 ? "text-faint" : ""}`} title={r.people < 5 ? "Too few people to judge" : undefined}>
                  {pct(r.paid, r.people)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-[14px] text-mute">No sign-ups in this window yet.</p>
      )}
    </section>
  );
}
