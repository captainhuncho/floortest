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

export default async function Contacts({ searchParams }: { searchParams: Promise<{ sort?: string; show?: string; q?: string }> }) {
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

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ sort: sp.sort, show: sp.show, q: search || undefined, ...patch })) if (v) p.set(k, v);
    return `/dashboard/contacts${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="max-w-5xl px-4 py-6 sm:px-8">
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
  );
}
