import { trackUse } from "@/lib/usage";
import { BETA_COLLECTIONS, canAddCollection, canCapCallouts } from "@/lib/desk";
import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { collectionsFor, isClosed } from "@/lib/desk";
import { fmtDay } from "@/lib/format";
import { genresFor } from "@/lib/plans";
import { briefItems } from "@/lib/brief";
import { APP_URL } from "@/lib/mail";
import { CollectionTile, Folder, NewCollection } from "./CollectionForms";
import { q } from "@/lib/db";
import { CapacityStrip } from "@/components/CapacityStrip";
import { sharedLinksFor } from "@/lib/share-links";
import { PageTitle } from "@/components/PageTitle";

export const metadata = { title: "Collections — FloorTest" };

/**
 * A folder per callout (rule 15 Collections, owner 28 Oct): the tab says Receiving / Open / Closed, the body carries the
 * name and numbers; then a dashed folder to add one (or the beta limit), and what's in the receiving callout.
 */
export default async function Collections() {
  const user = await requireUser();
  await trackUse(user.id, "collections");
  const collections = await collectionsFor(user.id);
  const sharing = await switchOn("sharing");
  const viaLinks = await sharedLinksFor(user);
  const canManage = user.role !== "member";
  const canAdd = await canAddCollection(user.id);
  // The receiving collection first, then open callouts (newest first), then closed ones (newest first).
  const rank = (c: (typeof collections)[number]) => (c.id === user.active_collection_id ? 0 : isClosed(c) ? 2 : 1);
  const ordered = [...collections].sort((a, b) => rank(a) - rank(b) || b.created_at - a.created_at);
  const receiving = collections.find((c) => c.id === user.active_collection_id && !isClosed(c));
  // What's in the receiving callout, newest first: only the fields the rows show.
  const inside = receiving?.count
    ? await q.all<{ id: number; title: string; sender_name: string; genre: string; bpm: number | null; musical_key: string | null; decision: string | null; played_at: number | null }>(
        `SELECT t.id, t.title, s.name AS sender_name, t.genre, t.bpm, t.musical_key, t.decision, t.played_at
           FROM tracks t JOIN senders s ON s.id = t.sender_id
          WHERE t.user_id = ? AND t.collection_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at DESC LIMIT 8`,
        user.id,
        receiving.id,
      )
    : [];
  return (
    <div className="page-gutter max-w-6xl py-4 sm:py-6">
      <PageTitle>Collections</PageTitle>
      <p className="mt-2 max-w-3xl text-sm text-mute">
        One per callout. Your link <span className="font-mono break-all text-bone">{APP_URL.replace(/^https?:\/\//, "")}/{user.handle}</span>{" "}
        {user.active_collection_id ? "sends new tracks to the one that's receiving." : "sends tracks straight to your Review Queue until you make one."}
      </p>
      <ul className="mt-2 grid gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((c) => {
          const genres = genresFor(c).custom ? genresFor(c).list : [];
          return (
            <li key={c.id} className="contents">
              <CollectionTile
                c={{ id: c.id, name: c.name, closesAt: c.closes_at, closesLabel: c.closes_at ? fmtDay(c.closes_at) : null, count: c.count, needsReview: c.needs_review, kept: c.kept, briefWanted: c.brief_wanted, bpmMin: c.bpm_min, bpmMax: c.bpm_max, briefNote: c.brief_note, allowSharing: !!c.allow_sharing, sharingAvailable: sharing, genres, brief: briefItems(c, genres, user.tz), maxTracks: c.max_tracks, full: !!c.full_at, art: c.art_key ? `/api/collection-art/${c.id}?v=${encodeURIComponent(c.art_key)}` : null, canCap: canCapCallouts(user.plan) }}
                receiving={c.id === user.active_collection_id}
                closed={isClosed(c)}
                canManage={canManage}
              />
            </li>
          );
        })}
        {canManage && (
          <li className="contents">
            {canAdd ? (
              <NewCollection tile />
            ) : (
              // Two per desk during the beta: the folder stays in place and says why there's no third.
              <Folder tab={<span className="font-mono tnum">{collections.length} of {BETA_COLLECTIONS}</span>} dashed hatched>
                <div className="m-auto max-w-64 text-center">
                  <p className="text-sm font-semibold text-mute">Two collections per desk during the beta</p>
                  <p className="mt-1 text-xs text-faint">Change one&apos;s name or close date to start a new callout.</p>
                </div>
              </Folder>
            )}
          </li>
        )}
      </ul>
      {receiving && inside.length > 0 && <Inside c={receiving} rows={inside} />}
      {viaLinks.length > 0 && (
        <section aria-labelledby="links-shared-h" className="mt-8">
          <h2 id="links-shared-h" className="text-[15px] font-bold text-bone">
            Shared with you to listen
          </h2>
          <p className="mt-1 text-xs text-mute sm:text-sm">Private collections other people opened to you. Your access is personal: please don&apos;t share the music.</p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {viaLinks.map((l) => (
              <li key={l.id}>
                <Link href={l.href} className="flex h-full flex-col gap-1 card p-3.5 text-bone hover:border-faint">
                  <span className="truncate text-[14px] font-bold">{l.collection_name}</span>
                  <span className="truncate text-[11px] text-mute">from {l.owner_name}</span>
                  <span className="mt-auto pt-2 text-[11px] font-bold tnum">
                    {l.count} {l.count === 1 ? "track" : "tracks"}{" "}
                    <span className="font-normal text-faint">
                      · {l.permission === "download" ? "Listen + Download" : "Listen"}
                      {l.expires_at ? ` · until ${fmtDay(l.expires_at)}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type InsideRow = { id: number; title: string; sender_name: string; genre: string; bpm: number | null; musical_key: string | null; decision: string | null; played_at: number | null };

/** The receiving callout's newest tracks as rows (rule 15 Collections): track and sender, genre, BPM · key, status. */
function Inside({ c, rows }: { c: { id: number; name: string; count: number; max_tracks: number | null }; rows: InsideRow[] }) {
  const status = (r: InsideRow) => (r.decision === "kept" ? "Kept" : r.decision === "passed" ? "Not for me" : r.played_at ? "Listened" : "Needs review");
  const cols = "sm:grid sm:grid-cols-[minmax(0,1fr)_9rem_7rem_6.5rem] sm:items-center sm:gap-4";
  return (
    <section aria-labelledby="inside-h" className="panel mt-8 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
        <h2 id="inside-h" className="text-[15px] font-bold text-bone">
          In {c.name}
        </h2>
        <div className="flex min-w-48 flex-1 items-center justify-end gap-3 sm:max-w-sm">
          {c.max_tracks ? (
            <div className="flex-1">
              <CapacityStrip used={c.count} limit={c.max_tracks} cells={25} small />
            </div>
          ) : null}
          <span className="font-mono text-xs text-mute tnum">{c.max_tracks ? `${c.count} of ${c.max_tracks}` : `${c.count} track${c.count === 1 ? "" : "s"}`}</span>
          <Link href={`/dashboard/collections/${c.id}`} className="-my-3 inline-flex min-h-11 items-center text-sm text-mute hover:text-bone">
            Open →
          </Link>
        </div>
      </div>
      <div aria-hidden className={`hidden border-t border-line px-5 py-2 text-xs font-semibold text-mute ${cols}`}>
        <span>Track</span>
        <span>Genre</span>
        <span>BPM · key</span>
        <span className="text-right">Status</span>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="border-t border-line">
            <Link href={`/dashboard/review?view=queue&s=all&t=${r.id}`} className={`flex min-h-11 items-center gap-3 px-4 py-3 text-sm hover:bg-ink-4 sm:px-5 ${cols}`}>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-bone">{r.title}</span> <span className="text-mute">· {r.sender_name}</span>
              </span>
              <span className="hidden truncate text-mute sm:block">{r.genre}</span>
              <span className="hidden font-mono text-xs text-faint tnum sm:block">{[r.bpm ? Math.round(r.bpm) : null, r.musical_key].filter(Boolean).join(" · ")}</span>
              <span className="shrink-0 text-right text-xs text-mute">{status(r)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
