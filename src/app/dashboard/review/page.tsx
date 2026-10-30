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
import { CARD, Icon, SectionHead } from "@/components/Kit";

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

  const tabLabel = STATUSES.find(([k]) => k === status)![1];
  // Says how the list is sorted, matching the query's ORDER BY above.
  const orderWords = status === "review" ? "Oldest first" : status === "all" ? "Newest first" : "Latest decisions first";

  return (
    // Redesign (owner, 30 Oct): the head, tabs and filters run across the top; below them the list card sits in a narrow
    // left column and the open track's cards take the room on the right from 1280px. One order at every width: on a
    // phone the open track comes first, then the rest of the list (the open row steps aside, so it reads as Next).
    // QueueState shows a tapped or next track at once, before the server's page arrives.
    <QueueState servedId={selected?.id ?? null} status={status}>
      <div className="page-gutter py-4 sm:py-6">
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-3.5 xl:max-w-[1360px]">
          <section className="flex min-w-0 flex-col gap-3" aria-labelledby="submissions-h">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11.5px] text-mute">
                  {counts.review
                    ? `${counts.review} waiting${status === "review" ? " · oldest first" : ""}`
                    : "You're all caught up"}
                  {collection ? ` · ${collection.name}` : ""}
                </p>
                <h1 id="submissions-h" className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">
                  Review Queue
                </h1>
              </div>
              <ViewToggle view="queue" />
            </header>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
              <StatusTabs
                active={status}
                tabs={STATUSES.map(([k, label]) => ({ key: k, label, count: counts[k], href: href({ s: k === "review" ? undefined : k, t: undefined }) }))}
              />
              <div className="flex min-w-0 items-center gap-2 lg:max-w-[520px] lg:flex-1">
                {collections.length > 1 && (
                  <FilterMenu
                    label="Collection"
                    icon
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
                <form action="/dashboard/review" className="relative min-w-0 flex-1" role="search">
                  {sp.c && <input type="hidden" name="c" value={sp.c} />}
                  {status !== "review" && <input type="hidden" name="s" value={status} />}
                  <label htmlFor="q" className="sr-only">
                    Search tracks
                  </label>
                  <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-mute">
                    <Icon name="search" className="size-4" />
                  </span>
                  <input
                    id="q"
                    name="q"
                    defaultValue={search}
                    placeholder="Search title, artist or sender"
                    className="input min-h-11 rounded-xl! bg-well! pl-9 max-sm:text-base sm:text-[13px]"
                  />
                </form>
              </div>
            </div>
          </section>

          <div className={`grid min-w-0 gap-4 ${twoColumns ? "xl:grid-cols-[380px_minmax(0,1fr)] xl:items-start" : ""}`}>
            {selected && sender && (
              <aside
                id="review-card"
                aria-label="Review"
                // The whole column turns like a page on a swipe (DecisionRail); it stays mounted while tracks change.
                data-swipe-zone
                className="min-w-0 xl:col-start-2 xl:row-start-1"
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
              <aside aria-label="Review" className={`${CARD} hidden min-h-64 items-center justify-center p-6 xl:col-start-2 xl:row-start-1 xl:flex`}>
                <p className="max-w-56 text-center text-[13px] text-mute">Nothing to review in this view. Pick another tab or collection.</p>
              </aside>
            )}

            {/* Fades while a tab change loads (see StatusTabs and globals.css). */}
            <section aria-label="Tracks in this view" className="review-list min-w-0 xl:col-start-1 xl:row-start-1">
              {totalActive === 0 && !search ? (
                <EmptyDesk link={`${APP_URL}/${user.handle}`} welcome={!!sp.welcome} />
              ) : rows.length === 0 ? (
                <div className={`${CARD} px-4 py-14 text-center`}>
                  <p className="text-[13px] font-semibold text-bone">
                    {search ? `Nothing matches “${search}”.` : status === "review" ? "Nothing waiting. You're all caught up." : "Nothing here yet."}
                  </p>
                  {status === "review" && counts.kept > 0 && (
                    <Link href={href({ s: "kept", t: undefined })} className="mt-3 inline-flex min-h-11 items-center text-[13px] text-bone underline underline-offset-4">
                      Prepare your {counts.kept} kept track{counts.kept === 1 ? "" : "s"} for a set →
                    </Link>
                  )}
                </div>
              ) : (
                <div className={`${CARD} p-3 pt-2`}>
                  <div className="px-0.5 pt-1 pb-2">
                    <SectionHead title={tabLabel} aside={orderWords} />
                  </div>
                  <TrackList
                    rows={rows}
                    showDecision={status === "all"}
                    selectedId={selected?.id ?? null}
                    hrefFor={Object.fromEntries(rows.map((r) => [r.id, href({ t: String(r.id) })]))}
                  />
                  <p className="mt-2.5 flex items-start gap-1.5 border-t border-dashed border-line px-0.5 pt-2.5 text-[11.5px] text-mute">
                    <Icon name="lock" className="mt-px size-3" />
                    Decisions stay private. Senders see Listened, Downloaded, Played out and your replies.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </QueueState>
  );
}

function EmptyDesk({ link, welcome }: { link: string; welcome: boolean }) {
  const steps = ["Press play", "Keep, Not for me, or reply. The next track comes up automatically", "Prepare your kept tracks for a set"];
  return (
    <div className={`${CARD} p-4 sm:p-6`}>
      <p className="text-[11.5px] font-semibold text-lime">{welcome ? "Your desk is ready" : "No tracks yet"}</p>
      <h2 className="mt-1.5 text-[18px] font-semibold leading-snug tracking-[-0.02em] text-bone">Share your link in your next callout.</h2>
      <p className="mt-1.5 max-w-lg text-[13px] text-mute">
        Senders pick a WAV or MP3, confirm their email and send. No account needed. New tracks land here, ready to play.
      </p>
      <p className="mt-4 w-fit max-w-full break-all rounded-[11px] border border-line bg-well px-3 py-2.5 font-mono text-[12.5px] text-bone">{link}</p>
      <ol className="mt-5 grid gap-2 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-2 rounded-[11px] border border-line bg-well p-3 text-[13px] text-bone">
            <span className="font-semibold text-lime tnum">{i + 1}</span> {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
