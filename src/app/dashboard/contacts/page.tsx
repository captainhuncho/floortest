import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q, likeContains } from "@/lib/db";
import { ago } from "@/lib/format";

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

const SORTS = [
  ["recent", "Recent", "last_at DESC NULLS LAST"],
  ["kept", "Most kept", "kept DESC, last_at DESC NULLS LAST"],
  ["name", "A–Z", "lower(s.name) ASC"],
] as const;
const SHOWS = [
  ["all", "Everyone", "1 = 1"],
  ["verified", "Verified", "s.verified_at IS NOT NULL"],
  ["messages", "With messages", "lm.text IS NOT NULL"],
  ["blocked", "Blocked", "s.blocked_at IS NOT NULL"],
] as const;

export default async function Contacts({ searchParams }: { searchParams: Promise<{ sort?: string; show?: string; q?: string; tab?: string; from?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const sort = SORTS.find(([k]) => k === sp.sort) ?? SORTS[0];
  const show = SHOWS.find(([k]) => k === sp.show) ?? SHOWS[0];
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

  // Phones: Figma "mobile-contacts-people" / "mobile-contacts-messages".
  const tab = sp.tab === "messages" ? "messages" : "people";
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
  const initials = (n: string) =>
    n
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");
  const hue = (id: number) => ({ background: `hsl(${(id * 67) % 360} 45% 35%)` });
  const short = (ts: number) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ sort: sp.sort, show: sp.show, q: search || undefined, ...patch })) if (v) p.set(k, v);
    return `/dashboard/contacts${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
    <div className="flex flex-col gap-4 px-4 pb-4 pt-1 font-[family-name:var(--font-stage-mono)] text-[#f1f1eb] md:hidden">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/floor" aria-label="Back to the Floor" className="grid size-8 place-items-center">
          <span aria-hidden className="size-4 bg-current [mask:url(/icons/arrow-left.svg)_center/contain_no-repeat]" />
        </Link>
        <h1 className="text-[18px] font-bold">Contacts</h1>
      </div>
      <nav aria-label="Contacts view" className="flex rounded-[20px] border border-[#2c2e29] bg-[#1e1f1b] p-0.5">
        {(
          [
            ["messages", `MESSAGES (${messages.length})`],
            ["people", `PEOPLE (${totals.people})`],
          ] as const
        ).map(([k, label]) => (
          <Link
            key={k}
            href={href({ tab: k === "people" ? undefined : k })}
            aria-current={tab === k ? "page" : undefined}
            className={`flex-1 rounded-2xl border-2 py-1.5 text-center text-[11px] ${
              tab === k ? "border-lime bg-[#272824] font-bold text-lime" : "border-transparent text-[#6b6e65]"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "people" ? (
        <>
          <dl className="grid grid-cols-3 gap-2">
            {[
              [totals.people, "Unique submitters"],
              [totals.sent, "Total submissions"],
              [totals.engaged, "Engaged"],
            ].map(([v, k]) => (
              <div key={k} className="flex flex-col-reverse gap-1 rounded-[10px] border border-[#2c2e29] bg-[#171815] p-3">
                <dt className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b6e65]">{k}</dt>
                <dd className="text-[24px] font-extrabold">{v}</dd>
              </div>
            ))}
          </dl>
          <form action="/dashboard/contacts" role="search" className="flex gap-2.5">
            {sp.show && <input type="hidden" name="show" value={sp.show} />}
            <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-[#2c2e29] bg-[#1e1f1b] px-3.5 py-2.5">
              <span aria-hidden className="size-3.5 shrink-0 bg-[#6b6e65] [mask:url(/icons/search.svg)_center/contain_no-repeat]" />
              <span className="sr-only">Search contacts</span>
              <input name="q" defaultValue={search} placeholder="Search names or emails" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#6b6e65]" />
            </label>
          </form>
          <div className="flex gap-2 overflow-x-auto">
            {SHOWS.map(([k, label]) => (
              <Link
                key={k}
                href={href({ show: k === "all" ? undefined : k })}
                aria-current={show[0] === k ? "page" : undefined}
                className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] ${show[0] === k ? "border border-[#2c2e29] bg-[#1e1f1b] font-bold" : "text-[#a3a69b]"}`}
              >
                {label.toLowerCase()}
              </Link>
            ))}
          </div>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-[#a3a69b]">{search ? `No contacts match “${search}”.` : "Contacts appear here after their first upload."}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((r) => {
                const last = latestBy.get(r.id);
                return (
                  <li key={r.id} className="flex flex-col gap-2.5 rounded-[10px] border border-[#2c2e29] bg-[#1e1f1b] p-3">
                    <Link href={`/dashboard/contacts/${r.id}`} className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white" style={hue(r.id)}>
                        {r.name.trim()[0]?.toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-[13px] font-bold">{r.name}</span>
                        <span className="truncate text-[11px] text-[#6b6e65]">{r.email}</span>
                        {(r.verified_at || r.blocked_at) && (
                          <span className={`w-fit rounded border px-1.5 py-0.5 text-[9px] font-bold ${r.blocked_at ? "border-danger/50 text-danger" : "border-lime/40 text-lime"}`}>
                            {r.blocked_at ? "blocked" : "verified"}
                          </span>
                        )}
                      </span>
                    </Link>
                    {last && (
                      <div className="flex flex-col gap-1">
                        <p className="truncate text-[13px] font-bold">{last.title}</p>
                        <p className="text-[10px] tracking-[0.5px] text-[#6b6e65]">
                          {last.collection ? `${last.collection.toUpperCase()} · ` : ""}
                          {short(last.created_at)}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1">
                        <p className="text-[22px] font-extrabold leading-none">{r.sent}</p>
                        <p className="text-[10px] text-[#6b6e65]">
                          sent · {r.kept} kept · {r.downloaded} downloaded
                        </p>
                      </div>
                      {r.last_at && Date.now() - r.last_at < WEEK && (
                        <span className="rounded-md border border-[#1e4226] bg-[#162a1a] px-2.5 py-1 text-[10px] font-bold tracking-[1px] text-[#4ade80]">NEW</span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <a href={`mailto:${r.email}`} className="flex items-center gap-1.5 rounded-md border border-[#2c2e29] bg-[#1e1f1b] px-2.5 py-1.5 text-[11px] text-[#a3a69b]">
                        ✉ <span className="font-bold">email</span>
                      </a>
                      <Link href={`/dashboard/contacts/${r.id}`} aria-label={`More about ${r.name}`} className="rounded-md border border-[#2c2e29] bg-[#1e1f1b] px-2.5 py-1.5 text-[11px] text-[#a3a69b]">
                        ···
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-2">
            {(
              [
                ["all", "all"],
                ["them", "from them"],
                ["you", "your replies"],
              ] as const
            ).map(([k, label]) => (
              <Link
                key={k}
                href={href({ tab: "messages", from: k === "all" ? undefined : k })}
                aria-current={from === k ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 text-[10px] ${from === k ? "border border-[#2c2e29] bg-[#1e1f1b] font-bold" : "text-[#a3a69b]"}`}
              >
                {label}
              </Link>
            ))}
          </div>
          {messages.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-[#a3a69b]">Messages from senders, and your replies, show up here.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {messages.map((m, i) => (
                <li key={i}>
                  <Link href={`/dashboard/contacts/${m.sender_id}`} className="flex flex-col gap-3 rounded-[10px] border border-[#2c2e29] bg-[#1e1f1b] p-3">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={hue(m.sender_id)}>
                          {initials(m.name)}
                        </span>
                        <span className="truncate text-[13px] font-bold">{m.kind === "reply" ? `You → ${m.name}` : m.name}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-[#6b6e65]">{ago(m.at)}</span>
                    </span>
                    <span className="line-clamp-3 text-[11px] italic leading-[1.4] text-[#a3a69b]">&ldquo;{m.text}&rdquo;</span>
                    {m.title && (
                      <span className="flex items-center gap-2 rounded-md border border-[#2c2e29] bg-[#10110f] p-2 text-[11px] font-bold">
                        <span aria-hidden>♫</span>
                        <span className="truncate">
                          {m.title}
                          {m.collection ? ` · ${m.collection}` : ""}
                        </span>
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
    <div className="hidden max-w-5xl px-4 py-6 sm:px-8 md:block">
      <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
      <p className="mt-2 max-w-xl text-mute">
        Everyone who has sent you music. Each contact keeps their tracks, your decisions, messages and private notes together.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Show">
          {SHOWS.map(([k, label]) => (
            <Link
              key={k}
              href={href({ show: k === "all" ? undefined : k })}
              aria-current={show[0] === k ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium ${show[0] === k ? "border-lime" : "border-transparent text-mute hover:text-bone"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <form action="/dashboard/contacts" role="search" className="ml-auto flex items-center gap-2">
          {sp.show && <input type="hidden" name="show" value={sp.show} />}
          {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
          <label htmlFor="contacts-q" className="sr-only">
            Search contacts
          </label>
          <input id="contacts-q" name="q" defaultValue={search} placeholder="Name or email" className="input w-52 py-2" />
        </form>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm text-mute">
        Sort:
        {SORTS.map(([k, label]) => (
          <Link
            key={k}
            href={href({ sort: k === "recent" ? undefined : k })}
            aria-current={sort[0] === k ? "true" : undefined}
            className={`rounded-md px-2 py-1 ${sort[0] === k ? "bg-bone text-ink" : "hover:text-bone"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-mute">{search ? `No contacts match “${search}”.` : "Contacts appear here after their first upload."}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/dashboard/contacts/${r.id}`} className="grid gap-x-6 gap-y-2 px-4 py-4 hover:bg-ink-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {r.name}
                    {r.verified_at ? <span className="chip border-lime/50 text-lime">Verified</span> : null}
                    {r.blocked_at ? <span className="chip border-danger/50 text-danger">Blocked</span> : null}
                  </p>
                  <p className="truncate text-sm text-mute">{r.email}</p>
                  {r.last_message && (
                    <p className="mt-1 truncate text-sm text-mute">
                      {r.last_message_kind === "reply" ? "You: " : "“"}
                      {r.last_message}
                      {r.last_message_kind === "message" ? "”" : ""}
                    </p>
                  )}
                </div>
                <dl className="flex items-start gap-5 text-sm tnum sm:text-right">
                  {[
                    ["Sent", r.sent],
                    ["Kept", r.kept],
                    ["Downloaded", r.downloaded],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-mute">{k}</dt>
                      <dd className={k === "Kept" && Number(v) > 0 ? "text-lime" : ""}>{v}</dd>
                    </div>
                  ))}
                  <div className="w-20">
                    <dt className="text-xs text-mute">Last track</dt>
                    <dd className="text-mute">{r.last_at ? ago(r.last_at) : "—"}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
    </>
  );
}
