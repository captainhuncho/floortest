import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q, likeContains } from "@/lib/db";
import { pickShow, pickSort, SHOWS } from "./filters";
import { ago } from "@/lib/format";
import { CARD, Chip, Cover, Icon, PageHead, SectionHead, SEG, segTab, initials } from "@/components/Kit";
import { ContactMenu } from "./ContactMenu";

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
};

const FROMS = [
  ["all", "All"],
  ["them", "From them"],
  ["you", "Your replies"],
] as const;

const short = (ts: number, timeZone?: string) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone });

/** Link tabs in the kit's segmented track: the current one is marked for screen readers as the current page. */
function SegLinks({ label, value, items }: { label: string; value: string; items: { key: string; label: React.ReactNode; href: string }[] }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
      <div className={SEG}>
        {items.map((i) => (
          <Link key={i.key} href={i.href} aria-current={i.key === value ? "page" : undefined} className={`${segTab(i.key === value)} pointer-coarse:min-h-11`}>
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** A list row in a card: 44px or more, a hairline between rows. */
const LI = "flex min-h-11 items-center gap-2.5 border-t border-line py-2 first:border-t-0";

export default async function Contacts({ searchParams }: { searchParams: Promise<{ sort?: string; show?: string; q?: string; tab?: string; from?: string }> }) {
  const user = await requireUser();
  await trackUse(user.id, "contacts");
  const sp = await searchParams;
  const sort = pickSort(sp.sort);
  const show = pickShow(sp.show);
  const search = (sp.q || "").trim().slice(0, 100);

  // Every sender, with their track stats and the latest message in either direction.
  const rows = (await q.all<Row>(`WITH msgs AS (
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
              lm.text AS last_message, lm.kind AS last_message_kind
       FROM senders s
       LEFT JOIN tracks t ON t.sender_id = s.id
       LEFT JOIN lm ON lm.sender_id = s.id AND lm.rn = 1
       WHERE s.user_id = ? AND ${show[2]} ${search ? "AND (s.name ILIKE ? OR s.email ILIKE ?)" : ""}
       GROUP BY s.id, lm.text, lm.kind ORDER BY ${sort[2]}`, user.id, user.id, user.id, ...(search ? [likeContains(search), likeContains(search)] : [])));

  const tab = sp.tab === "messages" ? "messages" : "people";
  // The latest track from each sender: shown beside the row from 768px up, where there's room.
  const latest = await q.all<{ sender_id: number; title: string; collection: string | null; created_at: number }>(
    `SELECT DISTINCT ON (t.sender_id) t.sender_id, t.title, c.name AS collection, t.created_at
       FROM tracks t LEFT JOIN collections c ON c.id = t.collection_id
       WHERE t.user_id = ? ORDER BY t.sender_id, t.created_at DESC`,
    user.id,
  );
  const latestBy = new Map(latest.map((l) => [l.sender_id, l]));
  const from = sp.from === "them" || sp.from === "you" ? sp.from : "all";
  const messages = await q.all<{ sender_id: number; name: string; at: number; text: string; kind: "message" | "reply"; title: string; collection: string | null }>(
    `SELECT * FROM (
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
  );
  const totals = {
    people: rows.length,
    sent: rows.reduce((n, r) => n + Number(r.sent), 0),
    engaged: rows.filter((r) => Number(r.kept) > 0 || r.last_message_kind === "reply").length,
  };
  const tz = user.tz || undefined;

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ sort: sp.sort, show: sp.show, q: search || undefined, ...patch })) if (v) p.set(k, v);
    return `/dashboard/contacts${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4">
        {/* One readout line instead of stat tiles, over the title: the numbers in bone, the words around them quiet. */}
        <PageHead
          title="Contacts"
          label={
            <span className="tnum">
              <b className="font-semibold text-bone">{totals.sent}</b> {totals.sent === 1 ? "track" : "tracks"} from <b className="font-semibold text-bone">{totals.people}</b>{" "}
              {totals.people === 1 ? "person" : "people"} · <b className="font-semibold text-bone">{totals.engaged}</b> kept or replied
            </span>
          }
        />
        <nav aria-label="Contacts view" className={`${SEG} flex`}>
          {(
            [
              ["people", "People", totals.people, href({ tab: undefined })],
              ["messages", "Messages", messages.length, href({ tab: "messages" })],
            ] as const
          ).map(([k, label, count, to]) => (
            <Link key={k} href={to} aria-current={tab === k ? "page" : undefined} className={`${segTab(tab === k)} flex-1 gap-1.5 pointer-coarse:min-h-11`}>
              {label} <span className="tnum">{count}</span>
            </Link>
          ))}
        </nav>

        {tab === "people" ? (
          <>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
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
              {/* Four filters can outgrow a phone: the track scrolls sideways inside the gutter, never the page. */}
              <SegLinks label="Show" value={show[0]} items={SHOWS.map(([k, label]) => ({ key: k, label, href: href({ show: k === "all" ? undefined : k }) }))} />
            </div>

            <section aria-labelledby="people-h" className={`${CARD} flex flex-col gap-1 p-3`}>
              <SectionHead id="people-h" icon="contacts" title="People" aside={<span>Sorted by {sort[1] === "A–Z" ? "name" : sort[1].toLowerCase()}</span>} />
              {rows.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-mute">{search ? `No contacts match “${search}”.` : "Contacts appear here after their first upload."}</p>
              ) : (
                <ul aria-label="People" className="flex flex-col">
                  {rows.map((r) => {
                    const last = latestBy.get(r.id);
                    const kept = Number(r.kept);
                    const downloaded = Number(r.downloaded);
                    return (
                      <li key={r.id} className={LI}>
                        <Link href={`/dashboard/contacts/${r.id}`} className="-my-2 flex min-w-0 flex-1 items-center gap-2.5 self-stretch rounded-[10px] py-2 transition-colors duration-150 hover:bg-well motion-reduce:transition-none">
                          <Cover text={initials(r.name)} />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[13px] font-semibold text-bone">{r.name}</span>
                              {r.blocked_at ? (
                                <Chip tone="down">Blocked</Chip>
                              ) : r.verified_at ? (
                                <span className="flex text-lime">
                                  <Icon name="check" className="size-3.5" />
                                  <span className="sr-only">Verified</span>
                                </span>
                              ) : null}
                            </span>
                            <span className="truncate text-[11.5px] text-mute tnum">
                              {r.email}
                              {r.last_at && (
                                <>
                                  {" · "}
                                  <span className="hidden sm:inline">last sent </span>
                                  {short(r.last_at, tz)}
                                </>
                              )}
                            </span>
                          </span>
                          {last && (
                            <span className="hidden w-52 shrink-0 flex-col gap-0.5 text-right lg:flex">
                              <span className="truncate text-[12px] text-mute">{last.title}</span>
                              <span className="truncate text-[11px] text-faint">{last.collection ?? "Unsorted"}</span>
                            </span>
                          )}
                          <span className="flex shrink-0 items-center gap-1 tnum">
                            <Chip>{Number(r.sent)} sent</Chip>
                            {kept > 0 && <Chip tone="up">{kept} kept</Chip>}
                            {downloaded > 0 && (
                              <span className="hidden md:inline-flex">
                                <Chip>{downloaded} downloaded</Chip>
                              </span>
                            )}
                          </span>
                        </Link>
                        <ContactMenu id={r.id} name={r.name} email={r.email} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <>
            <SegLinks label="Messages from" value={from} items={FROMS.map(([k, label]) => ({ key: k, label, href: href({ tab: "messages", from: k === "all" ? undefined : k }) }))} />
            <section aria-labelledby="messages-h" className={`${CARD} flex flex-col gap-1 p-3`}>
              <SectionHead id="messages-h" icon="mail" title="Messages" aside="Newest first" />
              {messages.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-mute">Messages from senders, and your replies, show up here.</p>
              ) : (
                <ul aria-label="Messages" className="flex flex-col">
                  {messages.map((m, i) => (
                    <li key={i} className="border-t border-line first:border-t-0">
                      <Link href={`/dashboard/contacts/${m.sender_id}`} className="-mx-1.5 flex min-h-11 gap-2.5 rounded-[10px] px-1.5 py-2.5 transition-colors duration-150 hover:bg-well motion-reduce:transition-none">
                        <Cover text={initials(m.name)} size="size-8" />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="flex items-center justify-between gap-3">
                            <span className="truncate text-[13px] font-semibold text-bone">{m.kind === "reply" ? `You → ${m.name}` : m.name}</span>
                            <span className="shrink-0 text-[11px] text-faint tnum">{ago(m.at)}</span>
                          </span>
                          <span className={`line-clamp-2 rounded-[11px] border px-2.5 py-1.5 text-[12px] leading-[1.45] text-bone ${m.kind === "reply" ? "border-transparent bg-lime/12" : "border-line bg-well"}`}>
                            &ldquo;{m.text}&rdquo;
                          </span>
                          {m.title && (
                            <span className="truncate text-[11px] text-faint">
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
