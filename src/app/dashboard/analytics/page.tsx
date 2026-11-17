import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { calloutLinks, perDay, periodRange, PERIODS, sharedLinks, whatHappened, whoSent, type Happened, type PeriodKey } from "@/lib/analytics";
import { canMarkPlayedOut } from "@/lib/played-out-prompt";
import { CARD, type IconName } from "@/components/Kit";
import { FilterMenu } from "../list/FilterMenu";
import { FloorRow, LABEL, QUIET } from "../floor/Crates";
import { AnalyticsChart } from "./Chart";

export const metadata = { title: "Analytics — FloorTest" };

/** What the comparison is against, said in words ("4 more than the 7 days before"). Lifetime has none. */
const AGAINST: Record<PeriodKey, string> = {
  "7d": "the 7 days before",
  "30d": "the 30 days before",
  "90d": "the 3 months before",
  year: "the same time last year",
  all: "",
};
const SPAN: Record<PeriodKey, string> = { "7d": "in the last 7 days", "30d": "in the last 30 days", "90d": "in the last 3 months", year: "this year", all: "in total" };

const n = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;

/** Each "What happened" row: its icon, its line, and the detail under it (where a track landed, or who sent it). */
const HAPPENED: Record<Happened["type"], { icon: IconName; says: (e: Happened) => string; detail: (e: Happened) => string }> = {
  submitted: { icon: "inbox", says: (e) => `${e.sender} sent ${e.title}`, detail: (e) => e.place || "Review Queue" },
  kept: { icon: "heart", says: (e) => `${e.title} was kept`, detail: (e) => e.sender },
  played_out: { icon: "star", says: (e) => `${e.title} was played out`, detail: (e) => e.sender },
  downloaded: { icon: "dl", says: (e) => `${e.title} was downloaded`, detail: (e) => e.sender },
};

/**
 * Analytics (owner, 16 Nov; laid out as drawn in option 41): what happened on this desk and what the links it sent out
 * recorded, for a chosen period. Only data the privacy policy already covers, only this desk's, and only for the owner
 * and A&R / Admins. Nothing about visitors to the link.
 */
export default async function Analytics({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  // Owner and A&R / Admin only (owner, 16 Nov): the shared desk role check. Members have no menu entry; a typed address goes
  // to the Team page with its "not for your role" note, like every other admin page. In an admin's View as it reads only.
  const user = await requireRole("admin");
  const sp = await searchParams;
  const range = periodRange(sp.p, user.tz);
  const [day, senders, callouts, shared, happened] = await Promise.all([
    perDay(user, range),
    whoSent(user, range),
    calloutLinks(user, range),
    sharedLinks(user, range),
    whatHappened(user, range),
  ]);

  // DJ desks tell senders what they played out; label and A&R desks download instead.
  const dj = canMarkPlayedOut(user);
  const third = dj ? "Played out" : "Downloaded";
  const thirdOf = (t: { playedOut: number; downloaded: number }) => (dj ? t.playedOut : t.downloaded);
  const t = day.totals;
  const delta = day.prev ? t.in - day.prev.in : null;
  const empty = t.in === 0 && !callouts.rows.length && !shared.rows.length;
  const options = PERIODS.map(([k, label]) => ({ label, href: `/dashboard/analytics?p=${k}`, active: k === range.period }));
  const opened = shared.rows.reduce((sum, s) => sum + s.opened, 0);
  const shortDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: range.tz });
  const when = (ts: number) => shortDay.format(ts);
  // Zero clauses are left out, so the line only says what happened.
  const detail = [
    `From ${n(t.senders, "sender")}`,
    `you kept ${t.kept}`,
    t.passed > 0 && `${t.passed} not for me`,
    thirdOf(t) > 0 && `${thirdOf(t)} ${third.toLowerCase()}`,
    opened > 0 && `your shared links opened ${n(opened, "time")}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const linkNotes = [
    (callouts.more || shared.more) && "Showing the first of each.",
    shared.truncated && "Only your 500 newest shared links are counted.",
  ].filter(Boolean);
  const seeAll = "flex min-h-11 items-center justify-center rounded-[12px] text-[13px] font-medium text-bone underline-offset-4 hover:bg-well hover:underline";

  return (
    <div className="px-5 py-4 sm:py-7 md:px-8">
      <div className="mx-auto flex w-full min-w-0 max-w-[1000px] flex-col gap-5 lg:gap-6">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.03em] text-bone lg:text-[34px]">Analytics</h1>
            <p className="mt-1 text-[14px] leading-snug text-mute lg:text-[15px]">How your desk is doing.</p>
          </div>
          <FilterMenu label="Period" options={options} showValue />
        </header>

        {empty ? (
          <p className={`${CARD} p-4 text-[13px] leading-[1.45] text-mute`}>
            Nothing {SPAN[range.period]} yet. Share your link and the first tracks show up here.{" "}
            <Link href="/dashboard/floor#your-link" className="tap-text font-medium text-bone underline underline-offset-4">
              Share your link
            </Link>
          </p>
        ) : (
          <>
            <section aria-labelledby="totals-h" className="flex flex-col gap-2">
              <h2 id="totals-h" className="sr-only">
                Totals
              </h2>
              <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[14px] leading-snug text-mute lg:text-[15px]">
                <span className="text-[56px] font-bold leading-none tracking-[-0.03em] text-bone tnum lg:text-[72px]">{t.in}</span>{" "}
                <span>
                  {t.in === 1 ? "track" : "tracks"} in
                  {delta !== null && ` · ${delta === 0 ? `same as ${AGAINST[range.period]}` : `${Math.abs(delta)} ${delta > 0 ? "more" : "fewer"} than ${AGAINST[range.period]}`}`}
                </span>
              </p>
              <p className="text-[14px] leading-snug text-bone tnum">{detail}</p>
              {day.truncated && <p className="text-[12px] text-mute">Only the most recent tracks are counted here.</p>}
            </section>

            {/* Two columns from 1180px, one under it. */}
            <div className="flex flex-col gap-6 min-[1180px]:grid min-[1180px]:grid-cols-2 min-[1180px]:items-start min-[1180px]:gap-x-10">
              <div className="flex min-w-0 flex-col gap-6">
                <section aria-labelledby="chart-h" className="flex flex-col gap-3">
                  <h2 id="chart-h" className={LABEL}>
                    Tracks in and kept, by {range.bucket}
                  </h2>
                  <AnalyticsChart
                    bars={day.bars.map((b) => ({ key: b.key, label: b.label, in: b.in, kept: b.kept, third: thirdOf(b) }))}
                    thirdLabel={third}
                    span={SPAN[range.period]}
                    unit={range.bucket}
                  />
                </section>

                <section aria-labelledby="happened-h" className="flex flex-col">
                  <h2 id="happened-h" className={LABEL}>
                    What happened
                  </h2>
                  {happened.length > 0 ? (
                    <ul className="flex flex-col">
                      {happened.map((e) => (
                        <li key={e.id}>
                          <FloorRow icon={HAPPENED[e.type].icon} title={HAPPENED[e.type].says(e)} detail={HAPPENED[e.type].detail(e)} when={when(e.at)} href={`/dashboard/review?view=queue&s=all&t=${e.trackId}`} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-2 text-[12px] text-mute">Nothing on tracks still on your desk {SPAN[range.period]}.</p>
                  )}
                  <Link href="/dashboard/activity" className={seeAll} aria-label="See everything in Activity">
                    See everything
                  </Link>
                </section>
              </div>

              <div className="flex min-w-0 flex-col gap-6">
                <section aria-labelledby="senders-h" className="flex flex-col">
                  <div className="flex items-center justify-between gap-3">
                    <h2 id="senders-h" className={LABEL}>
                      Who sent what
                    </h2>
                    {senders.total > 0 && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-mute tnum">{n(senders.total, "sender")}</span>}
                  </div>
                  {senders.rows.length > 0 ? (
                    <ul className="flex flex-col">
                      {senders.rows.map((s) => (
                        <li key={s.id}>
                          <FloorRow
                            icon="user"
                            title={s.name}
                            detail={[n(s.tracks, "track"), s.place === null ? "more than one collection" : s.place || "Review Queue", s.kept > 0 && `${s.kept} kept`].filter(Boolean).join(" · ")}
                            when={when(s.last)}
                            href={`/dashboard/contacts/${s.id}`}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-2 text-[12px] text-mute">No tracks in this period.</p>
                  )}
                  {senders.total > senders.rows.length && (
                    <Link href="/dashboard/contacts" className={seeAll}>
                      All senders
                    </Link>
                  )}
                </section>

                {(shared.rows.length > 0 || callouts.rows.length > 0) && (
                  <section aria-labelledby="links-h" className="flex flex-col">
                    <h2 id="links-h" className={LABEL}>
                      Links you sent out
                    </h2>
                    <ul className="flex flex-col">
                      {shared.rows.map((s, i) => (
                        <li key={`s${i}`}>
                          <FloorRow icon="share" title={s.who} detail={`opened ${n(s.opened, "time")} · played ${s.played}${s.downloaded ? ` · downloaded ${s.downloaded}` : ""}`} />
                        </li>
                      ))}
                      {callouts.rows.map((c) => (
                        <li key={`c${c.id}`}>
                          <FloorRow icon="folder" title={c.name} detail={`${n(c.tracks, "track")} sent in · ${n(c.senders, "sender")}`} href={`/dashboard/collections/${c.id}`} />
                        </li>
                      ))}
                    </ul>
                    {linkNotes.length > 0 && <p className="pt-1 text-[12px] text-mute">{linkNotes.join(" ")}</p>}
                  </section>
                )}
              </div>
            </div>
          </>
        )}

        {empty && (
          <Link href="/dashboard/activity" className={`${QUIET} w-fit`}>
            See everything in Activity
          </Link>
        )}
      </div>
    </div>
  );
}
