import { trackUse } from "@/lib/usage";
import { canCapCallouts } from "@/lib/desk";
import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { collectionsFor, isClosed } from "@/lib/desk";
import { q, type Track } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { genresFor, MIX_STATUS } from "@/lib/plans";
import { briefItems } from "@/lib/brief";
import { DownloadActions } from "../../DownloadActions";
import { ListRows, type ListRow } from "../../list/ListRows";
import { CollectionDetailHeader, DeleteCollection, EditCollectionInfo } from "../CollectionForms";
import { Teammates } from "../Teammates";
import { OwnerUpload } from "../OwnerUpload";
import { ShareLinks, type ShareLinkView } from "../ShareLinks";
import { linksFor, sharingOn } from "@/lib/share-links";
import { featureOn } from "@/lib/features";
import { MAX_MEMBERS, members, voteTally } from "@/lib/team";

export const metadata = { title: "Collection — FloorTest" };

/** A collection as a folder: every track in it, whatever its status. Phones get the Figma "04 Collection Detail". */
export default async function CollectionFolder({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await trackUse(user.id, "collection");
  const { id } = await params;
  const all = await collectionsFor(user.id);
  const c = all.find((x) => String(x.id) === id);
  if (!c) notFound();
  const receiving = c.id === user.active_collection_id;
  const genres = genresFor(c);
  const team = (await featureOn("shared", user)) ? await members(c.id) : null;
  // Share links (behind the "sharing" switch): only while sharing is switched on.
  const links = (await sharingOn()) ? await linksFor(user, c.id) : null;
  const sharedTracks = links ? Number((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM tracks WHERE collection_id = ? AND deleted_at IS NULL AND share_ok = 1", c.id))?.n ?? 0) : 0;

  const tracks = await q.all<Track & { sender_name: string; sender_email: string; sender_verified: number | null }>(
    `SELECT t.*, s.name AS sender_name, s.email AS sender_email, s.verified_at AS sender_verified
       FROM tracks t JOIN senders s ON s.id = t.sender_id
       WHERE t.user_id = ? AND t.collection_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at DESC LIMIT 500`,
    user.id,
    c.id,
  );
  const tally = await voteTally(tracks.map((t) => t.id));
  const cards: ListRow[] = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    sender: t.sender_name,
    senderId: t.sender_id,
    senderEmail: t.sender_email,
    senderVerified: !!t.sender_verified,
    meta: [t.genre || null, t.bpm ? `${Math.round(t.bpm)} BPM` : null, tally.get(t.id)].filter(Boolean) as string[],
    mixLabel: MIX_STATUS[t.mix_status as keyof typeof MIX_STATUS] ?? null,
    duplicateOf: t.duplicate_of,
    message: t.message,
    duration: t.duration,
    peaks: t.peaks ? JSON.parse(t.peaks) : null,
    decision: t.decision,
    played: !!t.played_at,
    downloaded: !!t.downloaded_at,
    replied: !!t.replied_at,
    createdAt: t.created_at,
  }));
  const editable = {
    id: c.id,
    name: c.name,
    closesAt: c.closes_at,
    closesLabel: c.closes_at ? fmtDay(c.closes_at) : null,
    count: c.count,
    needsReview: c.needs_review,
    kept: c.kept,
    briefWanted: c.brief_wanted,
    bpmMin: c.bpm_min,
    bpmMax: c.bpm_max,
    briefNote: c.brief_note,
    allowSharing: !!c.allow_sharing,
    sharingAvailable: await switchOn("sharing"),
    maxTracks: c.max_tracks,
    full: !!c.full_at,
    art: c.art_key ? `/api/collection-art/${c.id}?v=${encodeURIComponent(c.art_key)}` : null,
    canCap: canCapCallouts(user.plan),
    genres: genres.custom ? genres.list : [],
    brief: briefItems(c, genres.custom ? genres.list : [], user.tz),
  };
  const brief = editable.brief;

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-4 pt-1 text-bone md:hidden">
        <CollectionDetailHeader c={editable} receiving={receiving} closed={isClosed(c)} canDelete={all.length > 1} />
        {brief.length > 0 && (
          <section aria-label="Brief" className="card p-3.5">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[12px]">
              {brief.map((b) => (
                <div key={b.key} className="contents">
                  <dt className="text-[11px] font-bold uppercase text-faint">{b.label}</dt>
                  <dd className={b.key === "note" ? "italic" : ""}>{b.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <p className="flex gap-2 text-[11px] font-bold">
          <span className="text-mute">{c.needs_review} NEED REVIEW</span>
          <span className="font-normal text-faint">·</span>
          <span className="text-bone">{c.kept} KEPT</span>
          <span className="font-normal text-faint">·</span>
          <span>{c.count} TOTAL</span>
        </p>
      </div>

      {/* Desktop: Figma "desktop-collection-detail" */}
      <div className="hidden max-w-6xl flex-col gap-5 px-8 pb-5 pt-6 text-bone md:flex">
        <div>
          <p className="text-[11px] text-faint">
            <Link href="/dashboard/collections" className="hover:text-bone">
              ← Collections
            </Link>{" "}
            / <span className="text-bone">{c.name}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <h1 className="flex items-center gap-3 text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone">
              {c.name}
              {receiving && !isClosed(c) && (
                <span className="flex items-center gap-1 rounded-md border border-white bg-white/10 px-2 py-1 text-[11px] font-bold tracking-[0.5px]">
                  <span aria-hidden className="size-[5px] rounded-full bg-white" />
                  RECEIVING
                </span>
              )}
              {isClosed(c) && <span className="rounded-md border border-faint px-2 py-1 text-[11px] font-bold tracking-[0.5px] text-mute">{c.full_at ? "FULL" : "CLOSED"}</span>}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <EditCollectionInfo c={editable} receiving={receiving} closed={isClosed(c)} canDelete={all.length > 1} />
              <DownloadActions collectionId={c.id} crateName={c.name} count={c.count} size="sm" />
            </div>
          </div>
        </div>
        <section aria-label="Brief" className="card px-4 py-3.5">
          {brief.length ? (
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              {brief.map((b) => (
                <div key={b.key} className={`min-w-0 ${b.key === "note" ? "basis-full lg:basis-auto lg:flex-1" : ""}`}>
                  <dt className="text-[11px] font-bold uppercase text-faint">{b.label}</dt>
                  <dd className={`mt-1 text-[12px] ${b.key === "note" ? "italic" : ""}`}>{b.text}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[12px] text-mute">No brief yet. Use Edit collection to add BPM, genres, what you want and a note for senders.</p>
          )}
        </section>
        <dl className="grid grid-cols-3 gap-4">
          {[
            ["Needs review", c.needs_review],
            ["Kept", c.kept],
            ["Total received", c.count],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col-reverse gap-1 card px-4 py-3">
              <dt className="sr-only">{k}</dt>
              <dd className="text-[16px] font-bold">
                {v} track{v === 1 ? "" : "s"}
              </dd>
              <span aria-hidden className="text-[11px] font-bold uppercase text-faint">
                {k}
              </span>
            </div>
          ))}
        </dl>
      </div>

      {/* One list for every screen size, so keyboard shortcuts and the player are registered once. */}
      <div className="max-w-6xl pb-4 md:px-8">
        <div className="mx-4 mb-4 md:mx-0">
          <OwnerUpload collectionId={c.id} collectionName={c.name} />
        </div>
        {links && (
          <div className="mx-4 mb-4 md:mx-0">
            <ShareLinks collectionId={c.id} links={links as ShareLinkView[]} sharedTracks={sharedTracks} />
          </div>
        )}
        {team && (
          <div className="mx-4 mb-4 md:mx-0">
            <Teammates collectionId={c.id} members={team} max={MAX_MEMBERS} teamCanDecide={!!c.team_can_decide} />
          </div>
        )}
        {cards.length ? (
          <ListRows rows={cards} statusTag collections={all.map((x) => ({ id: x.id, name: x.name }))} />
        ) : (
          <p className="mx-4 card p-4 text-[12px] text-mute md:mx-0">This folder is empty. Tracks sent while it&apos;s receiving land here.</p>
        )}
        <div className="mx-4 mt-8 md:mx-0">
          <DeleteCollection c={{ id: c.id, name: c.name }} canDelete={all.length > 1} />
        </div>
      </div>
    </>
  );
}
