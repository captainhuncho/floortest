import { pickStatus, TRACK_STATUSES, type TrackStatus } from "@/lib/statuses";
import { trackUse } from "@/lib/usage";
import { cookies } from "next/headers";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { collectionsFor } from "@/lib/desk";
import { q, likeContains, type Sender, type Track } from "@/lib/db";
import { APP_URL } from "@/lib/mail";
import { ReviewPanel } from "../ReviewPanel";
import { toPlayer } from "@/lib/player-track";
import { SubmissionsList } from "../list/SubmissionsList";
import { TrackList, type Row } from "../TrackList";
import { ViewToggle } from "../ViewToggle";
import { FilterMenu } from "../list/FilterMenu";
import { StatusTabs } from "./StatusTabs";
import { QueueState, ShownPanel } from "./QueueState";
import { VIEW_COOKIE } from "../view-cookie";

export const metadata = { title: "Review Queue — FloorTest" };

const STATUSES = TRACK_STATUSES;
type StatusKey = TrackStatus;

type Search = { c?: string; s?: string; t?: string; q?: string; welcome?: string; view?: string; type?: string; sender?: string; genre?: string; bpm?: string; verified?: string };

export default async function Submissions({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const jar = await cookies();
  const saved = jar.get(VIEW_COOKIE)?.value;
  // Queue is the default; the List view sticks once someone picks it (remembered in a cookie).
  const view = sp.view === "list" || sp.view === "queue" ? sp.view : saved === "list" ? "list" : "queue";
  await trackUse(user.id, view === "list" ? "review_list" : "review_queue");
  if (view === "list") return <SubmissionsList user={user} sp={sp} />;
  const status: StatusKey = pickStatus(sp.s);
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
  const from = "FROM tracks t JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id LEFT JOIN releases r ON r.id = t.release_id AND r.user_id = t.user_id";
  const cond = STATUSES.find(([k]) => k === status)![2];
  // Needs review plays oldest-first like a queue; decided views show the latest decisions first.
  const order = status === "review" ? "t.created_at ASC" : status === "all" ? "t.created_at DESC" : "t.decided_at DESC";
  // The open track (when the address names one) with its sender, scoped to this account.
  const selectedWithSender = (id: number) =>
    Number.isSafeInteger(id)
      ? q.get<Track & { s: Sender }>(
          "SELECT t.*, to_jsonb(s) AS s FROM tracks t JOIN senders s ON s.id = t.sender_id WHERE t.id = ? AND t.user_id = ? AND t.deleted_at IS NULL",
          id,
          user.id,
        )
      : Promise.resolve(undefined);
  // Counts for every tab, the list, and the requested track load at the same time.
  const [counts, tracks, requested] = await Promise.all([
    q.get<Record<StatusKey, number>>(
      `SELECT ${STATUSES.map(([k, , c]) => `COUNT(*) FILTER (WHERE ${c}) AS "${k}"`).join(", ")} ${from} WHERE ${base.join(" AND ")}`,
      ...args,
    ).then((r) => r!),
    q.all<Track & { sender_name: string; collection_name: string | null; release_title: string | null }>(
      `SELECT t.*, s.name AS sender_name, c.name AS collection_name, r.title AS release_title ${from}
       WHERE ${base.join(" AND ")} AND ${cond} ORDER BY ${order} LIMIT 500`,
      ...args,
    ),
    sp.t ? selectedWithSender(Number(sp.t)) : Promise.resolve(undefined),
  ]);

  // A folder's tracks sit together under its first track, in track order.
  const firstAt = new Map<string, number>();
  tracks.forEach((t, i) => t.release_id && !firstAt.has(t.release_id) && firstAt.set(t.release_id, i));
  const ordered = tracks
    .map((t, i) => ({ t, at: t.release_id ? firstAt.get(t.release_id)! : i }))
    .sort((a, b) => a.at - b.at || (a.t.track_no ?? 0) - (b.t.track_no ?? 0))
    .map((x) => x.t);
  const rows: Row[] = ordered.map((t) => ({
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
    release: t.release_id ? { id: t.release_id, title: t.release_title ?? "Folder", count: tracks.filter((x) => x.release_id === t.release_id).length } : null,
  }));

  const href = (patch: Partial<Search>) => {
    const merged: Search = { view: sp.view === "queue" ? "queue" : undefined, c: sp.c, s: status === "review" ? undefined : status, q: search || undefined, t: sp.t, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/dashboard/review${s ? `?${s}` : ""}`;
  };

  // The review panel always has something: the requested track, else the first in the list.
  const picked = requested ?? (!sp.t && rows[0] ? await selectedWithSender(rows[0].id) : undefined);
  const { s: pickedSender, ...pickedTrack } = picked ?? ({} as Partial<Track & { s: Sender }>);
  const selected = picked ? (pickedTrack as Track) : undefined;
  const sender = picked ? (typeof pickedSender === "string" ? (JSON.parse(pickedSender) as Sender) : pickedSender) : undefined;
  const idx = selected ? rows.findIndex((r) => r.id === selected.id) : -1;
  const nextRow = idx >= 0 ? rows[idx + 1] : rows.find((r) => r.id !== selected?.id);
  const prevRow = idx > 0 ? rows[idx - 1] : undefined;
  const totalActive = collections.reduce((n, c) => n + c.count, 0);
  const twoColumns = !!selected || totalActive > 0;

  return (
    // Rule 15 Queue (owner, 28 Oct). One order at every width: heading and tabs, the open track, then the rest of the
    // list. Below 1280px that reads top to bottom, the open track as a card (its own row leaves the list); from
    // 1280px the heading and list share the narrow left column and the open track gets the room on the right.
    // QueueState shows a tapped or next track at once, before the server's page arrives.
    <QueueState servedId={selected?.id ?? null} status={status}>
      <div className={`grid min-h-full ${twoColumns ? "xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] xl:grid-rows-[auto_1fr]" : ""}`}>
        <section className="min-w-0 px-4 pt-6 sm:px-8 xl:col-start-1 xl:row-start-1 xl:px-6" aria-labelledby="submissions-h">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 id="submissions-h" className="page-title">
                Review Queue {counts.review > 0 && <span className="font-mono text-mute tnum">{counts.review}</span>}
              </h1>
              {/* The heading already carries the number on a phone; the line stays for "all caught up" and a collection. */}
              <p className={`mt-1 text-mute ${counts.review && !collection ? "max-sm:hidden" : ""}`}>
                {counts.review
                  ? `${counts.review} track${counts.review === 1 ? "" : "s"} need${counts.review === 1 ? "s" : ""} a decision`
                  : "You're all caught up"}
                {collection ? ` in ${collection.name}` : ""}.
              </p>
            </div>
            <ViewToggle view="queue" />
          </header>

          <StatusTabs
            active={status}
            tabs={STATUSES.map(([k, label]) => ({ key: k, label, count: counts[k], href: href({ s: k === "review" ? undefined : k, t: undefined }) }))}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {collections.length > 1 && (
              <FilterMenu
                label="Collection"
                options={[
                  { label: "All collections", href: href({ c: undefined, t: undefined }), active: !collection },
                  ...collections.map((c) => ({
                    label: c.needs_review > 0 ? `${c.name} · ${c.needs_review} new` : c.name,
                    href: href({ c: String(c.id), t: undefined }),
                    active: c.id === collection?.id,
                  })),
                ]}
              />
            )}
            <form action="/dashboard/review" className="ml-auto min-w-48 flex-1 sm:max-w-72" role="search">
              {sp.c && <input type="hidden" name="c" value={sp.c} />}
              {status !== "review" && <input type="hidden" name="s" value={status} />}
              <label htmlFor="q" className="sr-only">
                Search tracks
              </label>
              <input id="q" name="q" defaultValue={search} placeholder="Search title, artist or sender" className="input py-2" />
            </form>
          </div>
        </section>

        {selected && sender && (
          <aside
            id="review-card"
            aria-label="Review"
            // The whole card turns like a page on a swipe (DecisionRail); it stays mounted while tracks change.
            data-swipe-zone
            className="panel mx-4 mt-4 overflow-hidden sm:mx-8 xl:sticky xl:top-[68px] xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:m-0 xl:h-[calc(100dvh-68px)] xl:self-start xl:overflow-y-auto xl:rounded-none xl:border-0 xl:border-l xl:bg-ink-2/60"
          >
            <ShownPanel servedId={selected.id}>
              <ReviewPanel
                key={selected.id}
                track={selected}
                sender={sender}
                collections={collections}
                selfHref={href({ t: String(selected.id) })}
                next={nextRow ? { href: href({ t: String(nextRow.id) }), track: toPlayer(nextRow) } : null}
                prev={prevRow ? { href: href({ t: String(prevRow.id) }), track: toPlayer(prevRow) } : null}
                position={idx >= 0 && rows.length > 1 ? `${idx + 1} of ${rows.length}` : null}
              />
            </ShownPanel>
          </aside>
        )}
        {/* Wide screens keep the review column even when this tab is empty, so switching tabs never reflows the page. */}
        {!selected && totalActive > 0 && (
          <aside aria-label="Review" className="hidden border-line bg-ink-2/60 xl:sticky xl:top-[68px] xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:flex xl:h-[calc(100dvh-68px)] xl:items-center xl:justify-center xl:self-start xl:border-l">
            <p className="max-w-56 text-center text-sm text-mute">Nothing to review in this view. Pick another tab or collection.</p>
          </aside>
        )}

        {/* Fades while a tab change loads (see StatusTabs and globals.css). */}
        <section aria-label="Tracks in this view" className="review-list min-w-0 px-4 pt-4 pb-6 sm:px-8 xl:col-start-1 xl:row-start-2 xl:px-6">
          {totalActive === 0 && !search ? (
            <EmptyDesk link={`${APP_URL}/${user.handle}`} welcome={!!sp.welcome} />
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-line py-16 text-center">
              <p className="font-medium">
                {search ? `Nothing matches “${search}”.` : status === "review" ? "Nothing waiting. You're all caught up." : "Nothing here yet."}
              </p>
              {status === "review" && counts.kept > 0 && (
                <Link href={href({ s: "kept", t: undefined })} className="mt-3 inline-block text-bone underline underline-offset-4">
                  Prepare your {counts.kept} kept track{counts.kept === 1 ? "" : "s"} for a set →
                </Link>
              )}
            </div>
          ) : (
            <>
              {rows.length > 1 && <h2 className="mb-2 text-sm font-semibold text-mute xl:sr-only">{status === "review" ? "Next" : "In this view"}</h2>}
              <TrackList
                rows={rows}
                showDecision={status === "all"}
                selectedId={selected?.id ?? null}
                hrefFor={Object.fromEntries(rows.map((r) => [r.id, href({ t: String(r.id) })]))}
              />
            </>
          )}
          {rows.length > 0 && <p className="mt-3 text-xs text-faint">Decisions stay private. Senders see Listened, Downloaded, Played out and your replies.</p>}
        </section>
      </div>
    </QueueState>
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
          <span className="text-lime">2</span> Keep, Not for me, or reply. The next track comes up automatically
        </li>
        <li className="rounded-md border border-line p-4">
          <span className="text-lime">3</span> Prepare your kept tracks for a set
        </li>
      </ol>
    </div>
  );
}
