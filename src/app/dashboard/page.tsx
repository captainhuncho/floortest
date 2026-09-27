import { cookies } from "next/headers";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { collectionsFor } from "@/lib/core";
import { q, likeContains, type Sender, type Track } from "@/lib/db";
import { APP_URL } from "@/lib/mail";
import { ReviewPanel } from "./ReviewPanel";
import { toPlayer } from "@/lib/player-track";
import { SubmissionsList } from "./list/SubmissionsList";
import { TrackList, type Row } from "./TrackList";
import { VIEW_COOKIE, ViewToggle } from "./ViewToggle";

export const metadata = { title: "Review Queue — FloorTest" };

const STATUSES = [
  ["review", "Needs review", "t.decision IS NULL"],
  ["kept", "Kept", "t.decision = 'kept'"],
  ["passed", "Could be better", "t.decision = 'passed'"],
  ["all", "All", "1 = 1"],
] as const;
type StatusKey = (typeof STATUSES)[number][0];

type Search = { c?: string; s?: string; t?: string; q?: string; welcome?: string; view?: string; type?: string; sender?: string; genre?: string; bpm?: string; verified?: string };

export default async function Submissions({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const jar = await cookies();
  const saved = jar.get(VIEW_COOKIE)?.value;
  // List (scan everything, decide inline) is the default; Queue is the focused one-at-a-time mode.
  const view = sp.view === "list" || sp.view === "queue" ? sp.view : saved === "queue" ? "queue" : "list";
  if (view === "list") return <SubmissionsList user={user} sp={sp} />;
  const status: StatusKey = STATUSES.some(([k]) => k === sp.s) ? (sp.s as StatusKey) : "review";
  const collections = await collectionsFor(user.id);
  const collection = sp.c ? collections.find((c) => String(c.id) === sp.c) : undefined;
  const search = (sp.q || "").trim().slice(0, 100);

  // Shared filters (collection + search); status is applied per tab so every tab can show a count.
  const base = ["t.user_id = ?", "t.deleted_at IS NULL"];
  const args: (string | number)[] = [user.id];
  if (collection) {
    base.push("t.collection_id = ?");
    args.push(collection.id);
  }
  if (search) {
    base.push("(t.title ILIKE ? OR t.artist ILIKE ? OR s.name ILIKE ? OR s.email ILIKE ? OR t.genre ILIKE ?)");
    args.push(...Array(5).fill(likeContains(search)));
  }
  const from = "FROM tracks t JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id";
  // One pass for every tab's count.
  const counts = (await q.get<Record<StatusKey, number>>(
    `SELECT ${STATUSES.map(([k, , cond]) => `COUNT(*) FILTER (WHERE ${cond}) AS "${k}"`).join(", ")} ${from} WHERE ${base.join(" AND ")}`,
    ...args,
  ))!;

  const cond = STATUSES.find(([k]) => k === status)![2];
  // Needs review plays oldest-first like a queue; decided views show the latest decisions first.
  const order = status === "review" ? "t.created_at ASC" : status === "all" ? "t.created_at DESC" : "t.decided_at DESC";
  const tracks = (await q.all<Track & { sender_name: string; collection_name: string | null }>(`SELECT t.*, s.name AS sender_name, c.name AS collection_name ${from}
       WHERE ${base.join(" AND ")} AND ${cond} ORDER BY ${order} LIMIT 500`, ...args));

  const rows: Row[] = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    sender: t.sender_name,
    collection: collection ? null : t.collection_name,
    genre: t.genre,
    duration: t.duration,
    bpm: t.bpm,
    peaks: t.peaks ? JSON.parse(t.peaks) : null,
    played: !!t.played_at,
    downloaded: !!t.downloaded_at,
    decision: t.decision,
    hasMessage: !!t.message,
    createdAt: t.created_at,
  }));

  const href = (patch: Partial<Search>) => {
    const merged: Search = { view: sp.view === "queue" ? "queue" : undefined, c: sp.c, s: status === "review" ? undefined : status, q: search || undefined, t: sp.t, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/dashboard${s ? `?${s}` : ""}`;
  };

  // The review panel always has something: the requested track, else the first in the list.
  const selectedId = sp.t ? Number(sp.t) : rows[0]?.id;
  const selected = selectedId
    ? ((await q.get<Track>("SELECT * FROM tracks WHERE id = ? AND user_id = ? AND deleted_at IS NULL", selectedId, user.id)))
    : undefined;
  const sender = selected ? ((await q.get<Sender>("SELECT * FROM senders WHERE id = ?", selected.sender_id))!) : undefined;
  const idx = selected ? rows.findIndex((r) => r.id === selected.id) : -1;
  const nextRow = idx >= 0 ? rows[idx + 1] : rows.find((r) => r.id !== selected?.id);
  const prevRow = idx > 0 ? rows[idx - 1] : undefined;
  // Opening a track (t in the URL) is full review on narrow screens: the list steps aside until "Back".
  const focused = !!sp.t && !!selected;

  const totalActive = collections.reduce((n, c) => n + c.count, 0);

  return (
    <div className={`grid min-h-full ${selected ? "xl:grid-cols-[minmax(0,1fr)_minmax(400px,460px)]" : ""}`}>
      <section className={`min-w-0 px-4 py-6 sm:px-8 ${focused ? "hidden xl:block" : ""}`} aria-labelledby="submissions-h">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="submissions-h" className="text-3xl font-bold tracking-tight">
              Review Queue
            </h1>
            <p className="mt-1 text-mute">
              {counts.review
                ? `${counts.review} track${counts.review === 1 ? "" : "s"} need${counts.review === 1 ? "s" : ""} a decision`
                : "You're all caught up"}
              {collection ? ` in ${collection.name}` : ""}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ViewToggle view="queue" />
          </div>
        </header>

        <nav className="mt-6 flex flex-wrap gap-1 border-b border-line" aria-label="Status">
          {STATUSES.map(([k, label]) => (
            <Link
              key={k}
              href={href({ s: k === "review" ? undefined : k, t: undefined })}
              aria-current={status === k ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                status === k ? "border-lime text-bone" : "border-transparent text-mute hover:text-bone"
              }`}
            >
              {label} <span className="tnum text-mute">{counts[k]}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-mute">Collection:</span>
          {[{ id: undefined as number | undefined, name: "All", needs_review: 0 }, ...collections].map((c) => {
            const active = c.id === collection?.id;
            return (
              <Link
                key={c.id ?? "all"}
                href={href({ c: c.id ? String(c.id) : undefined, t: undefined })}
                aria-current={active ? "true" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  active ? "border-bone bg-bone text-ink" : "border-line text-mute hover:border-mute hover:text-bone"
                }`}
              >
                {c.name}
                {c.needs_review > 0 && <span className={active ? "" : "text-lime"}> · {c.needs_review} new</span>}
              </Link>
            );
          })}
          <form action="/dashboard" className="ml-auto min-w-48 flex-1 sm:max-w-72" role="search">
            {sp.c && <input type="hidden" name="c" value={sp.c} />}
            {status !== "review" && <input type="hidden" name="s" value={status} />}
            <label htmlFor="q" className="sr-only">
              Search tracks
            </label>
            <input id="q" name="q" defaultValue={search} placeholder="Search title, artist or sender" className="input py-2" />
          </form>
        </div>

        <div className="mt-4">
          {totalActive === 0 && !search ? (
            <EmptyDesk link={`${APP_URL}/${user.handle}`} welcome={!!sp.welcome} />
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-line py-16 text-center">
              <p className="font-medium">
                {search ? `Nothing matches “${search}”.` : status === "review" ? "Nothing waiting. You're all caught up." : "Nothing here yet."}
              </p>
              {status === "review" && counts.kept > 0 && (
                <Link href={href({ s: "kept", t: undefined })} className="mt-3 inline-block text-lime underline underline-offset-4">
                  Prepare your {counts.kept} kept track{counts.kept === 1 ? "" : "s"} for a set →
                </Link>
              )}
            </div>
          ) : (
            <TrackList
              rows={rows}
              selectedId={selected?.id ?? null}
              hrefFor={Object.fromEntries(rows.map((r) => [r.id, href({ t: String(r.id) })]))}
            />
          )}
        </div>
      </section>

      {selected && sender && (
        <aside
          aria-label="Review"
          className={`${focused ? "" : "border-t"} border-line bg-ink-2/60 xl:sticky xl:top-[68px] xl:h-[calc(100dvh-68px)] xl:self-start xl:overflow-y-auto xl:border-t-0 xl:border-l`}
        >
          {focused && (
            <nav aria-label="Review navigation" className="sticky top-[68px] z-30 flex items-center gap-2 border-b border-line bg-ink/90 px-4 py-2.5 backdrop-blur sm:px-6 xl:hidden">
              <Link href={href({ t: undefined })} className="text-sm text-mute hover:text-bone">
                ← Review Queue
              </Link>
              <span className="ml-auto font-mono text-xs text-mute tnum">{idx >= 0 ? `${idx + 1} of ${rows.length}` : ""}</span>
              {prevRow ? (
                <Link href={href({ t: String(prevRow.id) })} className="btn-ghost btn-sm" aria-label="Previous track">
                  ‹ Prev
                </Link>
              ) : (
                <span className="btn-ghost btn-sm pointer-events-none opacity-40">‹ Prev</span>
              )}
              {nextRow ? (
                <Link href={href({ t: String(nextRow.id) })} className="btn-ghost btn-sm" aria-label="Next track">
                  Next ›
                </Link>
              ) : (
                <span className="btn-ghost btn-sm pointer-events-none opacity-40">Next ›</span>
              )}
            </nav>
          )}
          <ReviewPanel
            key={selected.id}
            track={selected}
            sender={sender}
            collections={collections}
            selfHref={href({ t: String(selected.id) })}
            next={nextRow ? { href: href({ t: String(nextRow.id) }), track: toPlayer(nextRow) } : null}
            prevHref={prevRow ? href({ t: String(prevRow.id) }) : null}
          />
        </aside>
      )}
    </div>
  );
}

function EmptyDesk({ link, welcome }: { link: string; welcome: boolean }) {
  return (
    <div className="card p-8">
      <p className="label text-lime">{welcome ? "Your desk is ready" : "No tracks yet"}</p>
      <h2 className="mt-3 text-2xl font-bold">Share your link in your next callout.</h2>
      <p className="mt-2 max-w-lg text-mute">
        Senders pick a WAV or MP3, confirm their email and send. No account needed. New tracks land here, ready to play.
      </p>
      <p className="mt-6 w-fit rounded-md border border-line bg-ink px-4 py-3 font-mono">{link}</p>
      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        <li className="rounded-md border border-line p-4">
          <span className="text-lime">1</span> Press play
        </li>
        <li className="rounded-md border border-line p-4">
          <span className="text-lime">2</span> Keep, could be better, or reply. The next track comes up automatically
        </li>
        <li className="rounded-md border border-line p-4">
          <span className="text-lime">3</span> Prepare your kept tracks for a set
        </li>
      </ol>
    </div>
  );
}
