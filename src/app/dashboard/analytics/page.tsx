import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { atLeast } from "@/lib/account-members";
import { calloutLinks, perDay, periodRange, PERIODS, sharedLinks, whoSent, type PeriodKey } from "@/lib/analytics";
import { canMarkPlayedOut } from "@/lib/played-out-prompt";
import { CARD, PageHead } from "@/components/Kit";
import { FilterMenu } from "../list/FilterMenu";
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

/**
 * Analytics (owner, 16 Nov): what happened on this desk and what the links it sent out recorded, for a chosen period.
 * Only data the privacy policy already covers, only this desk's, and only for the owner and A&R / Admins. Nothing about
 * visitors to the link.
 */
export default async function Analytics({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireUser();
  // Owner and A&R / Admin only (owner, 16 Nov). Members have no menu entry; a typed address goes back to the Floor.
  if (!atLeast(user.role, "admin")) redirect("/dashboard/floor");
  const sp = await searchParams;
  const range = periodRange(sp.p, user.tz);
  const [day, senders, callouts, shared] = await Promise.all([perDay(user, range), whoSent(user, range), calloutLinks(user, range), sharedLinks(user, range)]);

  // DJ desks tell senders what they played out; label and A&R desks download instead.
  const dj = canMarkPlayedOut(user);
  const third = dj ? "Played out" : "Downloaded";
  const thirdOf = (t: { playedOut: number; downloaded: number }) => (dj ? t.playedOut : t.downloaded);
  const t = day.totals;
  const delta = day.prev ? t.in - day.prev.in : null;
  const empty = t.in === 0 && !callouts.length && !shared.length;
  const options = PERIODS.map(([k, label]) => ({ label, href: `/dashboard/analytics?p=${k}`, active: k === range.period }));
  const current = PERIODS.find(([k]) => k === range.period)![1];

  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4 sm:gap-5">
        <PageHead label="Your desk and the links you shared" title="Analytics">
          <FilterMenu label={current} options={options} />
        </PageHead>

        {empty ? (
          <p className={`${CARD} p-4 text-[13px] leading-[1.45] text-mute`}>
            Nothing {SPAN[range.period]} yet. Share your link and the first tracks show up here.{" "}
            <Link href="/dashboard/floor#your-link" className="tap-text font-medium text-bone underline underline-offset-4">
              Share your link
            </Link>
          </p>
        ) : (
          <>
            <section aria-labelledby="totals-h" className={`${CARD} flex flex-col gap-3 p-3 sm:p-4`}>
              <h2 id="totals-h" className="sr-only">
                Totals
              </h2>
              <p className="text-[15px] leading-snug text-bone tnum">
                <span className="font-semibold">{n(t.in, "track")} in</span> · {n(t.senders, "sender")} · {t.kept} kept · {t.passed} not for me · {thirdOf(t)}{" "}
                {third.toLowerCase()}
              </p>
              {delta !== null && (
                <p className="text-[12px] text-mute">
                  {delta === 0 ? `Same as ${AGAINST[range.period]}` : `${Math.abs(delta)} ${delta > 0 ? "more" : "fewer"} than ${AGAINST[range.period]}`}
                </p>
              )}
              <AnalyticsChart
                bars={day.bars.map((b) => ({ key: b.key, label: b.label, in: b.in, kept: b.kept, third: thirdOf(b) }))}
                thirdLabel={third}
                span={SPAN[range.period]}
              />
            </section>

            <List
              id="senders-h"
              title="Who sent what"
              count={senders.rows.length}
              empty="No tracks in this period."
              more={senders.total > senders.rows.length ? `and ${n(senders.total - senders.rows.length, "more sender")}` : undefined}
            >
              {senders.rows.map((s, i) => (
                <Row key={i} name={s.name} detail={`${n(s.tracks, "track")} · ${s.kept} kept`} />
              ))}
            </List>

            {callouts.length > 0 && (
              <List id="callouts-h" title="Callout links" count={callouts.length}>
                {callouts.map((c) => (
                  <Row key={c.id} name={c.name} href={`/dashboard/collections/${c.id}`} detail={`${n(c.tracks, "track")} · ${n(c.senders, "sender")}`} />
                ))}
              </List>
            )}

            {shared.length > 0 && (
              <List id="shared-h" title="Shared collections" count={shared.length}>
                {shared.map((s, i) => (
                  <Row key={i} name={s.who} detail={`opened ${s.opened} · ${s.played} played${s.downloaded ? ` · ${s.downloaded} downloaded` : ""}`} />
                ))}
              </List>
            )}
          </>
        )}

        <Link href="/dashboard/activity" className="tap-text w-fit text-[13px] font-medium text-bone underline underline-offset-4">
          See everything in Activity
        </Link>
      </div>
    </div>
  );
}

function List({ id, title, count, empty, more, children }: { id: string; title: string; count: number; empty?: string; more?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={`${CARD} flex flex-col gap-1 p-3 sm:p-4`}>
      <h2 id={id} className="pb-1 text-[15px] font-semibold text-bone">
        {title}
      </h2>
      {count ? <ul className="flex flex-col">{children}</ul> : <p className="text-[12px] text-mute">{empty}</p>}
      {more && <p className="px-1 pt-1 text-[12px] text-mute">{more}</p>}
    </section>
  );
}

function Row({ name, detail, href }: { name: string; detail: string; href?: string }) {
  const body = (
    <>
      <span className="min-w-0 truncate text-[13px] text-bone">{name}</span>
      <span className="shrink-0 text-[12px] text-mute tnum">{detail}</span>
    </>
  );
  const cls = "flex min-h-11 items-center justify-between gap-3 rounded-[10px] px-1";
  return <li>{href ? <Link href={href} className={`${cls} hover:bg-well`}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}
