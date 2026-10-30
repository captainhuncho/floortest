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
import { CapTicks, CollectionTile, Folder, NewCollection } from "./CollectionForms";
import { q } from "@/lib/db";
import { sharedLinksFor } from "@/lib/share-links";
import { CARD, Chip, Icon, PageHead, SectionHead } from "@/components/Kit";
import { GHOST } from "../kitButtons";

export const metadata = { title: "Collections — FloorTest" };

/**
 * A card per callout (owner, 30 Oct: the redesign mock): where it stands, its numbers and the next step; a dashed tile to
 * add one (or the beta limit); then what's in the receiving callout, and collections shared with you.
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
  const host = APP_URL.replace(/^https?:\/\//, "");
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 sm:gap-5">
        <div className="flex flex-col gap-1.5">
          <PageHead label="One per callout" title="Collections" />
          <p className="max-w-3xl text-[12px] leading-snug text-mute">
            Your link <span className="break-all font-mono text-bone">{host}/{user.handle}</span>{" "}
            {user.active_collection_id ? "sends new tracks to the one that's receiving." : "sends tracks straight to your Review Queue until you make one."}
          </p>
        </div>
        {/* Cards in one column on phones, two from sm, three from xl. The New collection button sits on top on phones. */}
        <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ordered.map((c) => {
            const genres = genresFor(c).custom ? genresFor(c).list : [];
            return (
              <li key={c.id} className="contents">
                <CollectionTile
                  c={{ id: c.id, name: c.name, closesAt: c.closes_at, closesLabel: c.closes_at ? fmtDay(c.closes_at) : null, count: c.count, needsReview: c.needs_review, kept: c.kept, briefWanted: c.brief_wanted, bpmMin: c.bpm_min, bpmMax: c.bpm_max, briefNote: c.brief_note, allowSharing: !!c.allow_sharing, sharingAvailable: sharing, genres, brief: briefItems(c, genres, user.tz), maxTracks: c.max_tracks, full: !!c.full_at, art: c.art_key ? `/api/collection-art/${c.id}?v=${encodeURIComponent(c.art_key)}` : null, canCap: canCapCallouts(user.plan) }}
                  receiving={c.id === user.active_collection_id}
                  closed={isClosed(c)}
                  canManage={canManage}
                  link={`${APP_URL}/${user.handle}`}
                />
              </li>
            );
          })}
          {canManage && (
            <li className="contents">
              {canAdd ? (
                <NewCollection tile />
              ) : (
                // Two per desk during the beta: the tile stays in place and says why there's no third.
                <Folder tab={<span className="font-mono tnum">{collections.length} of {BETA_COLLECTIONS}</span>} hatched>
                  <div className="m-auto max-w-64 text-center">
                    <p className="text-[13px] font-semibold text-mute">Two collections per desk during the beta</p>
                    <p className="mt-1 text-[11.5px] text-faint">Change one&apos;s name or close date to start a new callout.</p>
                  </div>
                </Folder>
              )}
            </li>
          )}
        </ul>
        {receiving && inside.length > 0 && <Inside c={receiving} rows={inside} />}
        {viaLinks.length > 0 && (
          <section aria-labelledby="links-shared-h" className="flex flex-col gap-3">
            <div>
              <SectionHead id="links-shared-h" icon="head" title="Shared with you to listen" />
              <p className="mt-1.5 text-[12px] text-mute">Private collections other people opened to you. Your access is personal: please don&apos;t share the music.</p>
            </div>
            <ul className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {viaLinks.map((l) => (
                <li key={l.id}>
                  <Link href={l.href} className={`flex h-full min-h-11 flex-col gap-1 ${CARD} p-3 text-bone transition-colors hover:border-line-2`}>
                    <span className="truncate text-[13px] font-semibold">{l.collection_name}</span>
                    <span className="truncate text-[11.5px] text-mute">from {l.owner_name}</span>
                    <span className="mt-auto pt-2 text-[11.5px] font-semibold tnum">
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
    </div>
  );
}

type InsideRow = { id: number; title: string; sender_name: string; genre: string; bpm: number | null; musical_key: string | null; decision: string | null; played_at: number | null };

/** The receiving callout's newest tracks as rows (the mock's "In …" card): track, sender · genre · BPM · key, status. */
function Inside({ c, rows }: { c: { id: number; name: string; count: number; max_tracks: number | null }; rows: InsideRow[] }) {
  const status = (r: InsideRow) =>
    r.decision === "kept" ? <Chip tone="up">Kept</Chip> : r.decision === "passed" ? <Chip>Not for me</Chip> : r.played_at ? <Chip>Listened</Chip> : <Chip tone="warn">Needs review</Chip>;
  return (
    <section aria-labelledby="inside-h" className={`flex flex-col gap-2 ${CARD} p-3`}>
      <SectionHead
        id="inside-h"
        title={`In ${c.name}`}
        aside={
          <Link href={`/dashboard/collections/${c.id}`} className={GHOST}>
            Open
            <Icon name="chev" className="size-3.5" />
          </Link>
        }
      />
      {c.max_tracks ? (
        <CapTicks used={c.count} limit={c.max_tracks} />
      ) : (
        <p className="font-mono text-[11px] text-mute tnum">
          {c.count} track{c.count === 1 ? "" : "s"}
        </p>
      )}
      <ul>
        {rows.map((r) => {
          const sub = [r.sender_name, r.genre || null, [r.bpm ? Math.round(r.bpm) : null, r.musical_key].filter(Boolean).join(" · ") || null].filter(Boolean).join(" · ");
          return (
            <li key={r.id} className="border-t border-line first:border-t-0">
              <Link href={`/dashboard/review?view=queue&s=all&t=${r.id}`} className="-mx-1.5 flex min-h-11 items-center gap-3 rounded-[10px] px-1.5 py-2 hover:bg-well">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-bone">{r.title}</span>
                  <span className="block truncate text-[11.5px] text-mute tnum">{sub}</span>
                </span>
                <span className="shrink-0">{status(r)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
