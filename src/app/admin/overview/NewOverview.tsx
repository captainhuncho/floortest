import Link from "next/link";
import { can, requireAdmin } from "@/lib/admin";
import { needFor } from "@/lib/ops-perms";
import { Icon } from "../AdminNav";
import { overviewData, SPARK_DAYS, type Kpi, type Platform, type Tile } from "./data";
import { KIND_ROW, things } from "./model";
import { WaitingList } from "./WaitingList";
import "./overview.css";

const n = (i: number) => ({ "--i": i }) as React.CSSProperties;
const late = "text-[var(--admin-amber)]";

/**
 * Ops → Overview with the new look on (admin redesign B, step 3; switch `ops_shell`): "Waiting on me" first. A headline
 * (how many wait, the oldest, how many are past due) with "Start with the oldest"; the list, filterable by area; the
 * platform's health; this week's figures. Phones get B's tiles above the list. Nothing here is invented: every figure
 * comes from overviewData's one round of queries, and anything this person can't open is never read.
 */
export async function NewOverview() {
  const me = await requireAdmin("overview");
  const allowed = (href: string) => can(me.access, needFor(href));
  const d = await overviewData(me.access, allowed);
  const { head } = d;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const past = head.pastDue ? `${head.pastDue}${head.pastMore ? " or more" : ""} ${head.pastDue === 1 ? "is" : "are"} past due.` : "None is past due.";

  return (
    <div className="space-y-5 md:space-y-6">
      <header className="admin-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4" style={n(0)}>
        <div className="min-w-0">
          <p className="text-[13px] text-mute">{today}</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[34px]">
            {head.total ? `${things(head.total)} waiting on you` : "Nothing is waiting on you"}
          </h1>
          <p className="mt-1 max-w-[64ch] text-[15px] text-mute">
            {head.oldest ? (
              <>
                Oldest: <span className="text-bone">{head.oldest.title}</span>, {head.oldestAge} old. <span className={head.pastDue ? `font-semibold ${late}` : ""}>{past}</span>
              </>
            ) : d.lastHandled ? (
              `Everything is handled. Last: ${d.lastHandled.what}, ${d.lastHandled.ago} ago.`
            ) : (
              "Everything is handled. New items appear here as they come in."
            )}
          </p>
          {d.unavailable.length > 0 && <p className="mt-1 text-[13px] text-danger">Couldn&apos;t load: {d.unavailable.join(", ")}</p>}
        </div>
        {head.oldest && (
          <Link
            href={head.oldest.href}
            className="admin-press inline-flex min-h-11 items-center rounded-full bg-lime px-5 text-[14px] font-semibold text-ink hover:brightness-95"
          >
            Start with the oldest<span className="sr-only">: {head.oldest.title}</span>
          </Link>
        )}
      </header>

      {d.tiles.length > 0 && <PhoneTiles tiles={d.tiles} />}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-6">
        <WaitingList rows={d.rows} areas={d.areas} oldestId={head.oldest ? `${head.oldest.kind}-${head.oldest.id}` : null} lastHandled={d.lastHandled} capped={head.total > d.rows.length ? head.total : 0} />
        {d.platform && <PlatformCard p={d.platform} allowed={allowed} />}
      </div>

      {d.kpis.length > 0 && <Kpis kpis={d.kpis} />}
    </div>
  );
}

/** B's phone home: a tile per page with something to act on, its count and its first due. Phones only. */
function PhoneTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <nav aria-label="Waiting by page" className="md:hidden">
      <ul className="grid grid-cols-2 gap-2.5">
        {tiles.map((t, i) => (
          <li key={t.href} className="admin-rise" style={n(1 + i)}>
            <Link href={t.href} className="admin-press flex min-h-[96px] flex-col justify-between rounded-[18px] bg-ink-3 p-3.5 ring-1 ring-line">
              <span className="flex items-center justify-between text-mute">
                <Icon name={KIND_ROW[t.kind].icon} className="size-5" />
                {t.count > 0 ? (
                  <span className="min-w-[22px] rounded-full bg-lime px-1.5 text-center text-[12px] font-bold leading-[22px] text-[#10110f] tnum">{t.count}</span>
                ) : (
                  <span className="text-[12px] text-faint">Clear</span>
                )}
              </span>
              <span>
                <span className="block text-[15.5px] font-semibold leading-tight text-bone">
                  {t.label}
                  {t.count > 0 && <span className="sr-only">, {t.count} waiting</span>}
                </span>
                {t.count > 0 && <span className={`block text-[12.5px] ${t.late ? `font-semibold ${late}` : "text-faint"}`}>{t.note}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Platform: the health score, what isn't OK, the latest open incident and today's job runs. Only what was read. */
function PlatformCard({ p, allowed }: { p: Platform; allowed: (href: string) => boolean }) {
  const tone = p.score === 100 ? "bg-lime" : p.issues.some((i) => i.tone === "bad") ? "bg-danger" : "bg-[var(--admin-amber)]";
  return (
    <section id="health" aria-labelledby="platform-h" className="admin-panel admin-rise p-5" style={n(3)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="platform-h" className="text-[16px] font-semibold">
          Platform
        </h2>
        {p.incident && (
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-current ${late}`}>
            {p.incident.open} open incident{p.incident.open === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="flex items-baseline justify-between text-[13px] text-mute">
          Health score <span className="text-[22px] font-semibold tracking-[-0.02em] text-bone tnum">{p.score}</span>
        </p>
        <div role="meter" aria-label="Health score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.score} className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-4">
          <div className={`admin-grow h-full rounded-full ${tone}`} style={{ width: `${p.score}%` }} />
        </div>
        {p.issues.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {p.issues.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex min-h-11 items-center gap-2.5 rounded-[12px] px-2 text-[13.5px] hover:bg-ink-3">
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${c.tone === "bad" ? "bg-danger" : "bg-[var(--admin-amber)]"}`} />
                  <span className="font-semibold">{c.label}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-mute">
                    <span className="sr-only">{c.tone === "bad" ? "Problem: " : "Warning: "}</span>
                    {c.value}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-mute">Config, backup, jobs, email quota and storage are all OK.</p>
        )}
      </div>
      {p.incident && (
        <div className="mt-3 flex items-start gap-3 rounded-[14px] bg-ink-3 p-3">
          <Icon name="alert" className={`mt-0.5 size-[18px] shrink-0 ${late}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">{p.incident.message}</p>
            <p className="text-[12.5px] text-mute">
              {p.incident.kind.replace(/_/g, " ")} · opened {p.incident.age} ago
            </p>
          </div>
          <Link href="/admin/incidents" className="admin-press inline-flex min-h-11 shrink-0 items-center rounded-[10px] bg-ink-4 px-3.5 text-[13px] font-semibold hover:bg-line-2">
            Open<span className="sr-only"> incidents</span>
          </Link>
        </div>
      )}
      {(p.jobs || !p.incident) && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-4 text-[13px]">
          {p.jobs && (
            <>
              <dt className="text-mute">Jobs today</dt>
              <dd className="text-right tnum">
                <Link href="/admin/jobs" className="inline-flex min-h-11 items-center hover:underline">
                  {p.jobs.ran} runs logged · <span className={p.jobs.failed ? `ml-1 font-semibold ${late}` : "ml-1"}>{p.jobs.failed} failed</span>
                </Link>
              </dd>
            </>
          )}
          {!p.incident && allowed("/admin/incidents") && (
            <>
              <dt className="text-mute">Incidents</dt>
              <dd className="flex min-h-11 items-center justify-end">None open</dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}

/** This week's figures, the ones today's Overview already reads; a sparkline only where there is a real daily series. */
function Kpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <section aria-labelledby="kpi-h">
      <h2 id="kpi-h" className="sr-only">
        This week
      </h2>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-3">
        {kpis.map((k, i) => (
          <li key={k.label} className="admin-panel admin-rise flex flex-col px-4 pb-3 pt-3.5" style={n(4 + i)}>
            <p className="text-[12.5px] text-mute">{k.label}</p>
            <p className="mt-0.5 text-[24px] font-semibold leading-tight tracking-[-0.02em] tnum">{k.value}</p>
            <p className="text-[12.5px] text-mute">{k.note}</p>
            {k.series && <Spark days={k.series} label={k.label} i={i} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The last SPARK_DAYS days as a quiet line that draws in once (today's Overview's sparkline). */
function Spark({ days, label, i }: { days: number[]; label: string; i: number }) {
  const peak = Math.max(1, ...days);
  const pts = days.map((v, d) => `${((d / (days.length - 1)) * 100).toFixed(1)},${(30 - (v / peak) * 26).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-2 block h-8 w-full" role="img" aria-label={`${label} per day, last ${SPARK_DAYS} days: ${days.join(", ")}`}>
      <polyline points={pts} pathLength={1} fill="none" stroke="var(--color-bone)" strokeOpacity="0.55" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" className="admin-draw ops-ov-spark" style={n(i)} />
    </svg>
  );
}
