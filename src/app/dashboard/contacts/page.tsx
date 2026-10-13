import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q, likeContains, now } from "@/lib/db";
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
  await trackUse(user.id, "contacts");
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
  const hue = (id: number) => ({ background: `hsl(${(id * 67) % 360} 45% 30%)` });
  const short = (ts: number) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ sort: sp.sort, show: sp.show, q: search || undefined, ...patch })) if (v) p.set(k, v);
    return `/dashboard/contacts${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
    <div className="flex flex-col gap-4 px-4 pb-4 pt-1 text-bone md:hidden">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/floor" aria-label="Back to the Floor" className="grid size-8 place-items-center">
          <span aria-hidden className="size-4 bg-current [mask:url(/icons/arrow-left.svg)_center/contain_no-repeat]" />
        </Link>
        <h1 className="text-[18px] font-bold">Contacts</h1>
      </div>
      <nav aria-label="Contacts view" className="flex rounded-sheet border border-line bg-ink-3 p-0.5">
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
              tab === k ? "border-lime bg-ink-4 font-bold text-lime" : "border-transparent text-faint"
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
              [totals.people, "People"],
              [totals.sent, "Tracks sent"],
              [totals.engaged, "Kept or replied"],
            ].map(([v, k]) => (
              <div key={k} className="flex flex-col-reverse gap-1 rounded-card border border-line bg-ink-2 p-3">
                <dt className="text-[11px] font-bold text-faint">{k}</dt>
                <dd className="text-[24px] font-extrabold">{v}</dd>
              </div>
            ))}
          </dl>
          <form action="/dashboard/contacts" role="search" className="flex gap-2.5">
            {sp.show && <input type="hidden" name="show" value={sp.show} />}
            <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-line bg-ink-3 px-3.5 py-2.5">
              <span aria-hidden className="size-3.5 shrink-0 bg-faint [mask:url(/icons/search.svg)_center/contain_no-repeat]" />
              <span className="sr-only">Search contacts</span>
              <input name="q" defaultValue={search} placeholder="Search names or emails" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
            </label>
          </form>
          <div className="flex gap-2 overflow-x-auto">
            {SHOWS.map(([k, label]) => (
              <Link
                key={k}
                href={href({ show: k === "all" ? undefined : k })}
                aria-current={show[0] === k ? "page" : undefined}
                className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] ${show[0] === k ? "border border-line bg-ink-3 font-bold" : "text-mute"}`}
              >
                {label.toLowerCase()}
              </Link>
            ))}
          </div>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-mute">{search ? `No contacts match “${search}”.` : "Contacts appear here after their first upload."}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((r) => {
                const last = latestBy.get(r.id);
                return (
                  <li key={r.id} className="flex flex-col gap-2.5 rounded-card border border-line bg-ink-3 p-3">
                    <Link href={`/dashboard/contacts/${r.id}`} className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white" style={hue(r.id)}>
                        {r.name.trim()[0]?.toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-[13px] font-bold">{r.name}</span>
                        <span className="truncate text-[11px] text-faint">{r.email}</span>
                        {(r.verified_at || r.blocked_at) && (
                          <span className={`w-fit rounded border px-1.5 py-0.5 text-[11px] font-bold ${r.blocked_at ? "border-danger/50 text-danger" : "border-lime/40 text-lime"}`}>
                            {r.blocked_at ? "blocked" : "verified"}
                          </span>
                        )}
                      </span>
                    </Link>
                    {last && (
                      <div className="flex flex-col gap-1">
                        <p className="truncate text-[13px] font-bold">{last.title}</p>
                        <p className="text-[11px] tracking-[0.5px] text-faint">
                          {last.collection ? `${last.collection.toUpperCase()} · ` : ""}
                          {short(last.created_at)}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1">
                        <p className="text-[22px] font-extrabold leading-none">{r.sent}</p>
                        <p className="text-[11px] text-faint">
                          sent · {r.kept} kept · {r.downloaded} downloaded
                        </p>
                      </div>
                      {r.last_at && now() - r.last_at < WEEK && (
                        <span title="Sent in the last 7 days" className="rounded-md border border-[#1e4226] bg-[#162a1a] px-2.5 py-1 whitespace-nowrap text-[11px] font-bold tracking-[1px] text-[#4ade80]">SENT THIS WEEK</span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <a href={`mailto:${r.email}`} className="btn-ghost btn-sm">
                        ✉ <span className="font-bold">email</span>
                      </a>
                      <Link href={`/dashboard/contacts/${r.id}`} aria-label={`More about ${r.name}`} className="btn-ghost btn-sm">
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
                className={`rounded-md px-2.5 py-1 text-[11px] ${from === k ? "border border-line bg-ink-3 font-bold" : "text-mute"}`}
              >
                {label}
              </Link>
            ))}
          </div>
          {messages.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-mute">Messages from senders, and your replies, show up here.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {messages.map((m, i) => (
                <li key={i}>
                  <Link href={`/dashboard/contacts/${m.sender_id}`} className="flex flex-col gap-3 rounded-card border border-line bg-ink-3 p-3">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={hue(m.sender_id)}>
                          {initials(m.name)}
                        </span>
                        <span className="truncate text-[13px] font-bold">{m.kind === "reply" ? `You → ${m.name}` : m.name}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-faint">{ago(m.at)}</span>
                    </span>
                    <span className="line-clamp-3 text-[11px] italic leading-[1.4] text-mute">&ldquo;{m.text}&rdquo;</span>
                    {m.title && (
                      <span className="flex items-center gap-2 rounded-md border border-line bg-ink p-2 text-[11px] font-bold">
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
    {/* Desktop: Figma "desktop-contacts-people" / "desktop-contacts-messages" */}
    <div className="hidden max-w-6xl flex-col gap-5 px-8 py-6 text-bone md:flex">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone">Contacts</h1>
        </div>
        <nav aria-label="Contacts view" className="flex rounded-full border border-line bg-ink-3 p-0.5">
          {(
            [
              ["messages", "MESSAGES", messages.length],
              ["people", "PEOPLE", totals.people],
            ] as const
          ).map(([k, label, n]) => (
            <Link
              key={k}
              href={href({ tab: k === "people" ? undefined : k })}
              aria-current={tab === k ? "page" : undefined}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold ${tab === k ? "border-lime text-lime" : "border-transparent text-faint hover:text-bone"}`}
            >
              {label}
              <span className={`rounded-full px-1.5 text-[11px] ${tab === k ? "bg-lime/15" : "bg-line"}`}>{n}</span>
            </Link>
          ))}
        </nav>
      </div>

      {tab === "people" ? (
        <>
          <dl className="grid grid-cols-3 gap-3">
            {[
              [totals.people, "People who sent"],
              [totals.sent, "Tracks sent"],
              [totals.engaged, "Kept from or replied to"],
            ].map(([v, k]) => (
              <div key={k} className="flex flex-col-reverse gap-3 card p-4">
                <dt className="text-[11px] font-bold text-faint">{k}</dt>
                <dd className="text-[28px] font-extrabold leading-none">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-3">
            <form action="/dashboard/contacts" role="search" className="flex min-w-0 flex-1">
              {sp.show && <input type="hidden" name="show" value={sp.show} />}
              <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-line bg-ink-3 px-3.5 py-2.5">
                <span aria-hidden className="size-3.5 shrink-0 bg-faint [mask:url(/icons/search.svg)_center/contain_no-repeat]" />
                <span className="sr-only">Search contacts</span>
                <input name="q" defaultValue={search} placeholder="Search names or emails" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-faint" />
              </label>
            </form>
            <div className="flex gap-1">
              {SHOWS.map(([k, label]) => (
                <Link
                  key={k}
                  href={href({ show: k === "all" ? undefined : k })}
                  aria-current={show[0] === k ? "page" : undefined}
                  className={`rounded-lg border px-3 py-2.5 text-[11px] ${show[0] === k ? "border-line bg-ink-3 font-bold" : "border-transparent text-mute hover:text-bone"}`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="card p-8 text-center text-[12px] text-mute">
              {search ? `No contacts match “${search}”.` : "Contacts appear here after their first upload."}
            </p>
          ) : (
            <table className="w-full overflow-hidden rounded-xl border border-line text-left">
              <thead className="border-b border-line eyebrow text-faint">
                <tr>
                  <th className="px-4 py-3 font-bold">Sender</th>
                  <th className="px-4 py-3 font-bold">Latest track</th>
                  <th className="px-4 py-3 font-bold">Tracks sent</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 text-right font-bold">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const last = latestBy.get(r.id);
                  return (
                    <tr key={r.id} className="hover:bg-ink-2">
                      <td className="px-4 py-3.5">
                        <Link href={`/dashboard/contacts/${r.id}`} className="flex items-center gap-3">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white" style={hue(r.id)}>
                            {r.name.trim()[0]?.toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] font-bold">{r.name}</span>
                            <span className="block truncate text-[11px] text-faint">{r.email}</span>
                            {(r.verified_at || r.blocked_at) && (
                              <span className={`mt-1 inline-block rounded border px-1.5 text-[11px] font-bold ${r.blocked_at ? "border-danger/50 text-danger" : "border-lime/40 text-lime"}`}>
                                {r.blocked_at ? "blocked" : "verified"}
                              </span>
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        {last ? (
                          <>
                            <p className="truncate text-[12px] font-bold">{last.title}</p>
                            <p className="text-[11px] tracking-[0.5px] text-faint">
                              {last.collection ? `${last.collection.toUpperCase()} · ` : ""}
                              {short(last.created_at)}
                            </p>
                          </>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-[20px] font-extrabold leading-none">{r.sent}</p>
                        <p className="mt-1 text-[11px] text-faint">
                          {r.kept} kept · {r.downloaded} downloaded
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        {r.last_at && now() - r.last_at < WEEK ? (
                          <span title="Sent in the last 7 days" className="rounded-md border border-[#1e4226] bg-[#162a1a] px-2 py-1 whitespace-nowrap text-[11px] font-bold tracking-[1px] text-[#4ade80]">SENT THIS WEEK</span>
                        ) : Number(r.kept) > 0 ? (
                          <span title="You kept at least one of their tracks" className="rounded-md border border-line px-2 py-1 text-[11px] font-bold tracking-[1px] text-bone">KEPT</span>
                        ) : (
                          <span className="text-[11px] text-faint">{r.last_at ? ago(r.last_at) : "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <a href={`mailto:${r.email}`} className="btn-ghost btn-sm">
                            email
                          </a>
                          <Link href={`/dashboard/contacts/${r.id}`} aria-label={`More about ${r.name}`} className="btn-ghost btn-sm">
                            ···
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-2 border-b border-line pb-4">
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
                className={`rounded-md px-2.5 py-1 text-[11px] ${from === k ? "border border-line bg-ink-3 font-bold" : "text-mute hover:text-bone"}`}
              >
                {label}
              </Link>
            ))}
          </div>
          {messages.length === 0 ? (
            <p className="card p-8 text-center text-[12px] text-mute">Messages from senders, and your replies, show up here.</p>
          ) : (
            <ul className="flex max-w-3xl flex-col gap-3">
              {messages.map((m, i) => (
                <li key={i} className="flex flex-col gap-3 card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={hue(m.sender_id)}>
                        {initials(m.name)}
                      </span>
                      <span className="truncate text-[13px] font-bold">{m.kind === "reply" ? `You → ${m.name}` : m.name}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-faint">{ago(m.at)}</span>
                  </div>
                  <p className="text-[12px] italic leading-[1.5] text-mute">&ldquo;{m.text}&rdquo;</p>
                  {m.title && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ink px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span aria-hidden>♫</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-bold">{m.title}</span>
                          <span className="block text-[11px] text-faint">attached submission{m.collection ? ` · ${m.collection}` : ""}</span>
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Link href={`/dashboard/contacts/${m.sender_id}`} className="btn-ghost btn-sm">
                      Reply →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
    </>
  );
}
