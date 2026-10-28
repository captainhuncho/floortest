import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q, likeContains } from "@/lib/db";
import { pickShow, pickSort, SHOWS } from "./filters";
import { ago } from "@/lib/format";
import { PageTitle } from "@/components/PageTitle";
import { Tabs } from "@/components/Tabs";
import { Segmented } from "@/components/Segmented";
import { TrackTag } from "@/components/TrackRow";
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

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
const short = (ts: number, timeZone?: string) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-ink-4 font-bold text-mute ${small ? "size-6 text-[11px]" : "size-9 text-xs"}`}>
      {initials(name) || "?"}
    </span>
  );
}

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
    <div className="page-gutter flex flex-col gap-4 py-4 text-bone sm:py-6">
      <PageTitle>Contacts</PageTitle>
      <Tabs
        label="Contacts view"
        value={tab}
        items={[
          { key: "people", label: "People", count: totals.people, href: href({ tab: undefined }) },
          { key: "messages", label: "Messages", count: messages.length, href: href({ tab: "messages" }) },
        ]}
      />

      {tab === "people" ? (
        <>
          {/* One readout line instead of stat tiles: the numbers in bone, the words around them quiet. */}
          <p className="text-xs text-mute tnum">
            <b className="text-bone">{totals.sent}</b> {totals.sent === 1 ? "track" : "tracks"} from <b className="text-bone">{totals.people}</b>{" "}
            {totals.people === 1 ? "person" : "people"} · <b className="text-bone">{totals.engaged}</b> kept or replied
          </p>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <form action="/dashboard/contacts" role="search" className="flex min-w-0 flex-1">
              {sp.show && <input type="hidden" name="show" value={sp.show} />}
              {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-line bg-ink-3 px-3.5 md:min-h-9">
                <span aria-hidden className="size-3.5 shrink-0 bg-faint [mask:url(/icons/search.svg)_center/contain_no-repeat]" />
                <span className="sr-only">Search contacts</span>
                <input name="q" defaultValue={search} placeholder="Search names or emails" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-faint" />
              </label>
            </form>
            {/* Four filters can outgrow a phone: the track scrolls sideways inside the gutter, never the page. */}
            <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
              <Segmented
                label="Show"
                value={show[0]}
                items={SHOWS.map(([k, label]) => ({ key: k, label, href: href({ show: k === "all" ? undefined : k }) }))}
              />
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="border-y border-line py-10 text-center text-xs text-mute">{search ? `No contacts match “${search}”.` : "Contacts appear here after their first upload."}</p>
          ) : (
            <ul aria-label="People" className="divide-y divide-line border-y border-line">
              {rows.map((r) => {
                const last = latestBy.get(r.id);
                const kept = Number(r.kept);
                const downloaded = Number(r.downloaded);
                return (
                  <li key={r.id} className="flex min-h-[72px] items-center gap-3 pl-3 pr-1 transition-colors duration-150 hover:bg-ink-2">
                    <Avatar name={r.name} />
                    <Link href={`/dashboard/contacts/${r.id}`} className="flex min-w-0 flex-1 flex-col justify-center gap-1 self-stretch py-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-body font-bold text-bone">{r.name}</span>
                        {r.blocked_at ? (
                          <span className="inline-flex shrink-0 items-center rounded border border-danger/50 px-1.5 py-0.5 text-[11px] font-bold leading-none text-danger">Blocked</span>
                        ) : r.verified_at ? (
                          <TrackTag>Verified</TrackTag>
                        ) : null}
                      </span>
                      <span className="truncate text-xs text-faint tnum">
                        {plural(Number(r.sent), "track")}
                        <span className="hidden sm:inline">
                          {kept > 0 && ` · ${kept} kept`}
                          {downloaded > 0 && ` · ${downloaded} downloaded`}
                        </span>
                        {r.last_at && ` · last sent ${short(r.last_at, tz)}`}
                      </span>
                    </Link>
                    {last && (
                      <span className="hidden w-64 shrink-0 flex-col gap-1 text-right md:flex">
                        <span className="truncate text-xs text-mute">{last.title}</span>
                        <span className="truncate text-[11px] text-faint">{last.collection ?? "Unsorted"}</span>
                      </span>
                    )}
                    <ContactMenu id={r.id} name={r.name} email={r.email} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
            <Segmented
              label="Messages from"
              value={from}
              items={FROMS.map(([k, label]) => ({ key: k, label, href: href({ tab: "messages", from: k === "all" ? undefined : k }) }))}
            />
          </div>
          {messages.length === 0 ? (
            <p className="border-y border-line py-10 text-center text-xs text-mute">Messages from senders, and your replies, show up here.</p>
          ) : (
            <ul aria-label="Messages" className="max-w-3xl divide-y divide-line border-y border-line">
              {messages.map((m, i) => (
                <li key={i}>
                  <Link href={`/dashboard/contacts/${m.sender_id}`} className="flex flex-col gap-1.5 px-3 py-3 transition-colors duration-150 hover:bg-ink-2">
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar name={m.name} small />
                        <span className="truncate text-body font-bold">{m.kind === "reply" ? `You → ${m.name}` : m.name}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-faint tnum">{ago(m.at)}</span>
                    </span>
                    <span className="line-clamp-2 text-xs leading-relaxed text-mute">&ldquo;{m.text}&rdquo;</span>
                    {m.title && (
                      <span className="truncate text-[11px] text-faint">
                        About {m.title}
                        {m.collection ? ` · ${m.collection}` : ""}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
