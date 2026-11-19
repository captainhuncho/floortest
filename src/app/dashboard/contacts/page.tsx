import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { asPerson, q, likeContains } from "@/lib/db";
import { APP_URL } from "@/lib/mail";
import { pickShow, pickSort, SHOWS, SORTS } from "./filters";
import { ago } from "@/lib/format";
import { Cover, Icon, initials } from "@/components/Kit";
import { StartCopy } from "../floor/StartCopy";
import { ContactMenu } from "./ContactMenu";
import { SortSheet } from "./SortSheet";
import { CHIP_ROW, chip, DANGER_TEXT, dayLabel, QSEG, qsegTab, Status, statusOf } from "./ui";

export const metadata = { title: "Contacts — FloorTest" };

type Row = {
  id: number;
  name: string;
  email: string;
  verified_at: number | null;
  blocked_at: number | null;
  sent: number;
  kept: number;
  downloaded: number;
  last_at: number | null;
  last_message: string | null;
  last_message_kind: "message" | "reply" | null;
  total_people: number;
  total_sent: number;
  total_engaged: number;
};

/** People shown at first, and how many more each "Show more" adds; the most a link can ask for. */
const PAGE = 100;
const MAX_SHOWN = 2000;

const FROMS = [
  ["all", "All"],
  ["them", "From them"],
  ["you", "Your replies"],
] as const;

/** Filter chips as links: the current one is marked for screen readers as the current page. */
function ChipLinks({ label, value, items }: { label: string; value: string; items: { key: string; label: React.ReactNode; href: string }[] }) {
  return (
    <nav aria-label={label} className={CHIP_ROW}>
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={i.key === value ? "page" : undefined} className={chip(i.key === value)}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** A list row: 62px or more, a hairline between rows. */
const LI = "flex items-center border-b border-line last:border-b-0";
/** Phones: the rows sit on the page. From 1024px: one card of rows. */
const LIST_CARD = "lg:rounded-[16px] lg:border lg:border-line lg:bg-card lg:px-3.5";

export default async function Contacts({ searchParams }: { searchParams: Promise<{ sort?: string; show?: string; q?: string; tab?: string; from?: string; n?: string }> }) {
  const user = await requireUser();
  await trackUse(user.id, "contacts");
  const sp = await searchParams;
  const sort = pickSort(sp.sort);
  const show = pickShow(sp.show);
  const search = (sp.q || "").trim().slice(0, 100);

  const shown = Math.min(MAX_SHOWN, Math.max(PAGE, Math.ceil((Number(sp.n) || PAGE) / PAGE) * PAGE));
  // Every read here runs as the signed-in person (per-person rules, B8): the database itself shows only desks they work.
  const asMe = <T,>(fn: () => Promise<T>) => asPerson(user.actor_id, fn);

  // Senders, with their track stats and the latest message in either direction: the first `shown` of them, plus the
  // totals over everyone who matches (worked out before the limit).
  const rows = await asMe(() => q.all<Row>(`WITH msgs AS (
         SELECT sender_id, created_at AS at, message AS text, 'message' AS kind FROM tracks WHERE user_id = ? AND message != ''
         UNION ALL
         SELECT sender_id, created_at, detail, 'reply' FROM events WHERE user_id = ? AND type = 'reply'
       ), lm AS (
         SELECT sender_id, text, kind, ROW_NUMBER() OVER (PARTITION BY sender_id ORDER BY at DESC) AS rn FROM msgs
       )
       SELECT s.id, s.name, s.email, s.verified_at, s.blocked_at,
              COUNT(t.id) AS sent,
              COUNT(CASE WHEN t.decision = 'kept' THEN 1 END) AS kept,
              COUNT(t.downloaded_at) AS downloaded,
              MAX(t.created_at) AS last_at,
              lm.text AS last_message, lm.kind AS last_message_kind,
              COUNT(*) OVER () AS total_people,
              SUM(COUNT(t.id)) OVER () AS total_sent,
              SUM(CASE WHEN COUNT(CASE WHEN t.decision = 'kept' THEN 1 END) > 0 OR lm.kind = 'reply' THEN 1 ELSE 0 END) OVER () AS total_engaged
       FROM senders s
       LEFT JOIN tracks t ON t.sender_id = s.id
       LEFT JOIN lm ON lm.sender_id = s.id AND lm.rn = 1
       WHERE s.user_id = ? AND ${show[2]} ${search ? "AND (s.name ILIKE ? OR s.email ILIKE ?)" : ""}
       GROUP BY s.id, lm.text, lm.kind ORDER BY ${sort[2]} LIMIT ?`, user.id, user.id, user.id, ...(search ? [likeContains(search), likeContains(search)] : []), shown));

  const tab = sp.tab === "messages" ? "messages" : "people";
  // The latest track from each sender on screen, with what was decided: shown at the row's right from 1024px.
  const ids = rows.map((r) => r.id);
  const latest = ids.length
    ? await asMe(() =>
        q.all<{ sender_id: number; title: string; decision: string | null; deleted_at: number | null }>(
          `SELECT DISTINCT ON (t.sender_id) t.sender_id, t.title, t.decision, t.deleted_at
             FROM tracks t
             WHERE t.user_id = ? AND t.sender_id IN (${ids.map(() => "?").join(",")}) ORDER BY t.sender_id, t.created_at DESC`,
          user.id,
          ...ids,
        ),
      )
    : [];
  const latestBy = new Map(latest.map((l) => [l.sender_id, l]));
  const from = sp.from === "them" || sp.from === "you" ? sp.from : "all";
  const messages = await asMe(() => q.all<{ sender_id: number; name: string; at: number; text: string; kind: "message" | "reply"; title: string; collection: string | null }>(
    `SELECT sender_id, name, at, text, kind, title, collection FROM (
       SELECT t.sender_id, s.name, t.created_at AS at, t.message AS text, 'message' AS kind, t.title, c.name AS collection
         FROM tracks t JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id
         WHERE t.user_id = ? AND t.message != ''
       UNION ALL
       SELECT e.sender_id, s.name, e.created_at, e.detail, 'reply', COALESCE(t.title, ''), c.name
         FROM events e JOIN senders s ON s.id = e.sender_id LEFT JOIN tracks t ON t.id = e.track_id LEFT JOIN collections c ON c.id = t.collection_id
         WHERE e.user_id = ? AND e.type = 'reply'
     ) m ${from === "them" ? "WHERE kind = 'message'" : from === "you" ? "WHERE kind = 'reply'" : ""} ORDER BY at DESC LIMIT 200`,
    user.id,
    user.id,
  ));
  const totals = {
    people: Number(rows[0]?.total_people ?? 0),
    sent: Number(rows[0]?.total_sent ?? 0),
    engaged: Number(rows[0]?.total_engaged ?? 0),
  };
  const tz = user.tz || undefined;
  // A desk nobody has sent to yet: no filter or search narrowed it, there is simply no one.
  const emptyDesk = rows.length === 0 && !search && show[0] === "all";

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ sort: sp.sort, show: sp.show, q: search || undefined, ...patch })) if (v) p.set(k, v);
    return `/dashboard/contacts${p.size ? `?${p}` : ""}`;
  };

  const viewSwitch = (
    <nav aria-label="Contacts view" className={QSEG}>
      {(
        [
          ["people", "People", emptyDesk ? 0 : totals.people, href({ tab: undefined })],
          ["messages", "Messages", messages.length, href({ tab: "messages" })],
        ] as const
      ).map(([k, label, count, to]) => (
        <Link key={k} href={to} aria-current={tab === k ? "page" : undefined} className={qsegTab(tab === k)}>
          {label} <span className="font-normal text-faint tnum">{count}</span>
        </Link>
      ))}
    </nav>
  );

  const tools = (
    <div className="flex min-w-0 gap-2">
      <form action="/dashboard/contacts" role="search" className="flex min-w-0 flex-1">
        {sp.show && <input type="hidden" name="show" value={sp.show} />}
        {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-well px-3 text-mute focus-within:border-line-2">
          <Icon name="search" className="size-4" />
          <span className="sr-only">Search contacts</span>
          {/* 16px on phones so iOS doesn't zoom into the field; the desk's 13px from 640px up. */}
          <input name="q" defaultValue={search} placeholder="Search names or emails" className="min-w-0 flex-1 bg-transparent text-base text-bone outline-none placeholder:text-mute sm:text-[13px]" />
        </label>
      </form>
      <SortSheet current={sort[0]} options={SORTS.map(([k, label]) => ({ key: k, label, href: href({ sort: k === "recent" ? undefined : k }) }))} />
    </div>
  );

  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-[1040px] min-w-0 flex-col gap-3">
        <header className="flex flex-col gap-1">
          <h1 className="page-title">Contacts</h1>
          {/* One readout line, the numbers in bone and the words around them quiet. */}
          <p className="text-[13px] text-mute tnum">
            {emptyDesk ? (
              "No tracks yet"
            ) : (
              <>
                <b className="font-semibold text-bone">{totals.sent}</b> {totals.sent === 1 ? "track" : "tracks"} from <b className="font-semibold text-bone">{totals.people}</b>{" "}
                {totals.people === 1 ? "person" : "people"} · <b className="font-semibold text-bone">{totals.engaged}</b> kept or replied
              </>
            )}
          </p>
        </header>

        {tab === "people" && !emptyDesk ? (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
            {viewSwitch}
            {tools}
          </div>
        ) : (
          viewSwitch
        )}

        {tab === "people" ? (
          emptyDesk ? (
            <section aria-labelledby="empty-h" className="flex flex-col items-center gap-2.5 px-2 py-10 text-center">
              <span aria-hidden className="mb-1 grid size-14 place-items-center rounded-full border border-line bg-well text-mute">
                <Icon name="contacts" className="size-6" />
              </span>
              <h2 id="empty-h" className="text-[20px] font-semibold tracking-[-0.02em] text-bone">
                No one has sent you a track yet
              </h2>
              <p className="max-w-[34ch] text-[13px] leading-[1.5] text-mute">Everyone who sends you a track shows up here, with what they sent and what you did with it.</p>
              <div className="mt-2 flex w-full max-w-xs flex-col">
                <StartCopy link={`${APP_URL}/${user.handle}`} />
              </div>
            </section>
          ) : (
            <>
              <ChipLinks label="Show" value={show[0]} items={SHOWS.map(([k, label]) => ({ key: k, label, href: href({ show: k === "all" ? undefined : k }) }))} />
              <section aria-labelledby="people-h" className={LIST_CARD}>
                <h2 id="people-h" className="sr-only">
                  People, sorted by {sort[1] === "A–Z" ? "name" : sort[1].toLowerCase()}
                </h2>
                {rows.length === 0 ? (
                  search ? (
                    <div className="flex flex-col items-center gap-1 px-1 py-7 text-center text-[13px]">
                      <p className="font-semibold text-bone">No contacts match “{search}”.</p>
                      <p className="text-mute">Try part of a name or an email address.</p>
                      <Link href={href({ q: undefined })} className="tap-text mt-1 font-semibold text-bone underline underline-offset-2">
                        Clear the search
                      </Link>
                    </div>
                  ) : (
                    <p className="py-7 text-center text-[13px] text-mute">No one here for {show[1].toLowerCase()}.</p>
                  )
                ) : (
                  <ul aria-label="People" className="flex flex-col">
                    {rows.map((r) => {
                      const last = latestBy.get(r.id);
                      const kept = Number(r.kept);
                      const lastStatus = last ? statusOf(last) : null;
                      const meta = [`${Number(r.sent)} sent`, kept > 0 ? `${kept} kept` : null, r.last_at ? dayLabel(r.last_at, tz) : null].filter(Boolean).join(" · ");
                      return (
                        <li key={r.id} className={LI}>
                          <Link href={`/dashboard/contacts/${r.id}`} className="flex min-h-[62px] min-w-0 flex-1 items-center gap-3 py-2">
                            <Cover text={initials(r.name)} size="size-10" />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-[15px] font-semibold text-bone">{r.name}</span>
                                {r.blocked_at ? (
                                  <span className={`shrink-0 text-[12px] font-semibold ${DANGER_TEXT}`}>Blocked</span>
                                ) : r.verified_at ? (
                                  <span className="flex shrink-0 text-lime">
                                    <Icon name="check" className="size-3.5" />
                                    <span className="sr-only">Verified</span>
                                  </span>
                                ) : null}
                              </span>
                              <span className="truncate text-[12px] text-mute tnum">{meta}</span>
                            </span>
                            {last && (
                              <span className="hidden w-[220px] shrink-0 flex-col items-end gap-0.5 text-right lg:flex">
                                <span className="max-w-full truncate text-[12.5px] text-mute">{last.title}</span>
                                {lastStatus && lastStatus !== "Not for me" && <Status status={lastStatus} />}
                              </span>
                            )}
                            <Icon name="chev" className="size-4 text-faint lg:hidden" />
                          </Link>
                          <ContactMenu id={r.id} name={r.name} email={r.email} />
                        </li>
                      );
                    })}
                  </ul>
                )}
                {totals.people > rows.length && (
                  <Link
                    href={`${href({ tab: undefined, n: String(shown + PAGE) })}#people-h`}
                    className="flex min-h-11 items-center justify-center border-t border-line text-[13px] font-semibold text-mute hover:text-bone"
                  >
                    Show more ({rows.length} of {totals.people})
                  </Link>
                )}
              </section>
            </>
          )
        ) : (
          <>
            <ChipLinks label="Messages from" value={from} items={FROMS.map(([k, label]) => ({ key: k, label, href: href({ tab: "messages", from: k === "all" ? undefined : k }) }))} />
            <section aria-labelledby="messages-h" className={LIST_CARD}>
              <h2 id="messages-h" className="sr-only">
                Messages, newest first
              </h2>
              {messages.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-mute">Messages from senders, and your replies, show up here.</p>
              ) : (
                <ul aria-label="Messages" className="flex flex-col">
                  {messages.map((m, i) => (
                    <li key={i} className="border-b border-line last:border-b-0">
                      <Link href={`/dashboard/contacts/${m.sender_id}`} className="flex min-h-11 gap-3 py-3">
                        <Cover text={initials(m.name)} size="size-9" />
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="flex items-center justify-between gap-3">
                            <span className="truncate text-[14px] font-semibold text-bone">{m.kind === "reply" ? `You → ${m.name}` : m.name}</span>
                            <span className="shrink-0 text-[12px] text-faint tnum">{ago(m.at)}</span>
                          </span>
                          <span className={`line-clamp-2 rounded-xl border px-3 py-2 text-[13px] leading-[1.45] text-bone ${m.kind === "reply" ? "border-transparent bg-lime/10" : "border-line bg-well"}`}>
                            {m.text}
                          </span>
                          {m.title && (
                            <span className="truncate text-[12px] text-faint">
                              About {m.title}
                              {m.collection ? ` · ${m.collection}` : ""}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
