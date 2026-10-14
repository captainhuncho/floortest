import { TRACK_STATUSES, type TrackStatus } from "@/lib/statuses";
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
import { CaughtUp } from "./CaughtUp";
import { VIEW_COOKIE } from "../view-cookie";

export const metadata = { title: "Queue — FloorTest" };

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
  const from = "FROM tracks t JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id LEFT JOIN releases r ON r.id = t.release_id";
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
  // Opening a track (t in the URL) is full review on narrow screens: the list steps aside until "Back".
  const focused = !!sp.t && !!selected;
  // Deciding this one leaves nothing waiting: the review lands on "All caught up." instead of a next track.
  const lastWaiting = status === "review" && !!selected && rows.every((r) => r.id === selected.id);

  const totalActive = collections.reduce((n, c) => n + c.count, 0);

  return (
    <div className={`grid min-h-full ${selected || totalActive > 0 ? "xl:grid-cols-[minmax(0,1fr)_minmax(400px,460px)]" : ""}`}>
      <section className={`min-w-0 px-4 py-6 sm:px-8 ${focused ? "hidden xl:block" : ""}`} aria-labelledby="submissions-h">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="submissions-h" className="text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone">
              Queue
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

        <StatusTabs
          active={status}
          tabs={STATUSES.map(([k, label]) => ({ key: k, label, count: counts[k], href: href({ s: k === "review" ? undefined : k, t: undefined }) }))}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
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

        {/* Fades while a tab change loads (see StatusTabs and globals.css). */}
        <div className="review-list mt-4">
          {totalActive === 0 && !search ? (
            <EmptyDesk link={`${APP_URL}/${user.handle}`} welcome={!!sp.welcome} />
          ) : rows.length === 0 ? (
            status === "review" && !search ? (
              // The same state the one-by-one review lands on after the last waiting track is decided.
              <CaughtUp kept={counts.kept} link={`${APP_URL}/${user.handle}`} />
            ) : (
              <div className="rounded-xl border border-line py-16 text-center">
                <p className="font-medium">{search ? `Nothing matches “${search}”.` : "Nothing here yet."}</p>
              </div>
            )
          ) : (
            <TrackList
              rows={rows}
              showDecision={status === "all"}
              selectedId={selected?.id ?? null}
              hrefFor={Object.fromEntries(rows.map((r) => [r.id, href({ t: String(r.id) })]))}
            />
          )}
        </div>
      </section>

      {selected && sender && (
        <aside
          aria-label="Review"
          // Phones: the list comes first (title, status tabs, tracks); a track opens into full review with the decision
          // rail docked at the bottom, so the tab bar and mini player step aside while it's open (globals.css).
          data-review-open={focused ? "" : undefined}
          className={`${focused ? "" : "border-t max-md:hidden"} border-line bg-ink-2/60 xl:sticky xl:top-[68px] xl:h-[calc(100dvh-68px)] xl:self-start xl:overflow-y-auto xl:border-t-0 xl:border-l`}
        >
          {focused && (
            // Phones: Figma "Header" (← QUEUE / Now reviewing); the transport below has previous and next.
            <header className="flex items-end justify-between gap-3 px-4 pt-3 md:hidden">
              <div className="flex flex-col gap-[3px]">
                {/* 44px tall tap target; the negative margin keeps the header's layout where it was. */}
                <Link href={href({ t: undefined })} className="-my-3.5 -ml-2 inline-flex min-h-11 w-fit items-center px-2 text-[11px] font-medium text-mute">
                  ← QUEUE
                </Link>
                <h1 className="text-[22px] font-extrabold text-bone">Now reviewing</h1>
              </div>
              <span className="pb-1 text-[11px] text-faint tnum">{idx >= 0 ? `${idx + 1} of ${rows.length}` : ""}</span>
            </header>
          )}
          {focused && (
            <nav aria-label="Review navigation" className="sticky top-[68px] z-30 hidden items-center gap-2 border-b border-line bg-ink/90 px-4 py-2.5 backdrop-blur sm:px-6 md:flex xl:hidden">
              <Link href={href({ t: undefined })} className="text-sm text-mute hover:text-bone">
                ← Queue
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
            queueHref={href({ t: undefined })}
            lastWaiting={lastWaiting}
            docked={focused}
          />
        </aside>
      )}
      {/* Wide screens keep the review column even when this tab is empty, so switching tabs never reflows the page. */}
      {!selected && totalActive > 0 && (
        <aside aria-label="Review" className="hidden border-line bg-ink-2/60 xl:sticky xl:top-[68px] xl:flex xl:h-[calc(100dvh-68px)] xl:items-center xl:justify-center xl:self-start xl:border-l">
          <p className="max-w-56 text-center text-sm text-mute">Nothing to review in this view. Pick another tab or collection.</p>
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
          <span className="text-lime">2</span> Keep, Not for me, or reply. The next track comes up automatically
        </li>
        <li className="rounded-md border border-line p-4">
          <span className="text-lime">3</span> Prepare your kept tracks for a set
        </li>
      </ol>
    </div>
  );
}
