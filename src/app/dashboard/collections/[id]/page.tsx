import { trackUse } from "@/lib/usage";
import { atLeast } from "@/lib/account-members";
import { canCapCallouts } from "@/lib/desk";
import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { collectionsFor, isClosed } from "@/lib/desk";
import { now, q, type Track } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { genresFor, MIX_STATUS } from "@/lib/plans";
import { briefItems } from "@/lib/brief";
import { DownloadActions } from "../../DownloadActions";
import { ListRows, type ListRow } from "../../list/ListRows";
import { CollectionDetailHeader, DeleteCollection, EditCollectionInfo } from "../CollectionForms";
import { OwnerUpload } from "../OwnerUpload";
import { ShareLinks, type ShareLinkView } from "../ShareLinks";
import { linksFor, sharingOn } from "@/lib/share-links";

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
  // Team and link controls are for the owner and admins (their actions check this too).
  const admin = atLeast(user.role, "admin");
  // Share links (behind the "sharing" switch): only while sharing is switched on.
  const links = admin && (await sharingOn()) ? await linksFor(user, c.id) : null;
  const sharedTracks = links ? Number((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM tracks WHERE collection_id = ? AND deleted_at IS NULL AND share_ok = 1 AND share_terms IS NOT NULL", c.id))?.n ?? 0) : 0;

  const tracks = await q.all<Track & { sender_name: string; sender_email: string; sender_verified: number | null }>(
    `SELECT t.*, s.name AS sender_name, s.email AS sender_email, s.verified_at AS sender_verified
       FROM tracks t JOIN senders s ON s.id = t.sender_id
       WHERE t.user_id = ? AND t.collection_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at DESC LIMIT 500`,
    user.id,
    c.id,
  );
  const cards: ListRow[] = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    sender: t.sender_name,
    senderId: t.sender_id,
    senderEmail: t.sender_email,
    senderVerified: !!t.sender_verified,
    meta: [t.genre || null, t.bpm ? `${Math.round(t.bpm)} BPM` : null].filter(Boolean) as string[],
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
  const closed = isClosed(c);
  // Where it stands, in words (rule 15: no pills): Receiving with the lime dot, or Open / Closed / Full.
  const state = receiving && !closed ? "Receiving" : closed ? (c.full_at ? "Full" : `Closed${c.closes_at ? ` ${fmtDay(c.closes_at)}` : ""}`) : "Not receiving";
  const readout = [`${c.needs_review} to review`, `${c.kept} kept`, `${c.count} received`, !closed && c.closes_at ? `closes ${fmtDay(c.closes_at)}` : null].filter(Boolean).join(" · ");
  const briefList = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-3">
      {brief.map((b) => (
        <div key={b.key} className={`contents sm:block sm:min-w-0 ${b.key === "note" ? "sm:basis-full lg:basis-auto lg:flex-1" : ""}`}>
          <dt className="text-xs font-semibold text-mute">{b.label}</dt>
          <dd className={`text-bone sm:mt-1 ${b.key === "note" ? "italic" : ""}`}>{b.text}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-4 pt-1 text-bone md:hidden">
        <CollectionDetailHeader c={editable} receiving={receiving} closed={isClosed(c)} canManage={admin} />
        <p className="font-mono text-xs text-mute tnum">{readout}</p>
        {brief.length > 0 && (
          <section aria-label="Brief" className="panel p-4">
            {briefList}
          </section>
        )}
      </div>

      {/* Desktop: Figma "desktop-collection-detail" */}
      <div className="hidden max-w-6xl flex-col gap-5 px-8 pb-5 pt-6 text-bone md:flex">
        <div>
          <Link href="/dashboard/collections" className="-my-2 inline-flex min-h-11 items-center text-sm text-mute hover:text-bone">
            ← Collections
          </Link>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="page-title">{c.name}</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className={`inline-flex items-center gap-2 font-semibold ${receiving && !closed ? "text-bone" : "text-mute"}`}>
                  {receiving && !closed && <span aria-hidden className="size-2 rounded-full bg-lime" />}
                  {state}
                </span>
                <span className="font-mono text-xs text-mute tnum">{readout}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <EditCollectionInfo c={editable} receiving={receiving} closed={isClosed(c)} canManage={admin} />
              <DownloadActions collectionId={c.id} crateName={c.name} count={c.count} size="sm" />
            </div>
          </div>
        </div>
        <section aria-label="Brief" className="panel px-5 py-4">
          {brief.length ? briefList : <p className="text-sm text-mute">No brief yet. Use Edit collection to add BPM, genres, what you want and a note for senders.</p>}
        </section>
      </div>

      {/* One list for every screen size, so keyboard shortcuts and the player are registered once. */}
      <div className="max-w-6xl pb-4 md:px-8">
        {admin && (
          <div className="mx-4 mb-4 md:mx-0">
            <OwnerUpload collectionId={c.id} collectionName={c.name} />
          </div>
        )}
        {links && (
          <div className="mx-4 mb-4 md:mx-0">
            <ShareLinks collectionId={c.id} links={links as ShareLinkView[]} sharedTracks={sharedTracks} at={now()} />
          </div>
        )}
        {cards.length ? (
          <ListRows rows={cards} statusTag collections={all.map((x) => ({ id: x.id, name: x.name }))} />
        ) : (
          <p className="mx-4 panel p-4 text-sm text-mute md:mx-0">This folder is empty. Tracks sent while it&apos;s receiving land here.</p>
        )}
        {admin && (
          <div className="mx-4 mt-8 md:mx-0">
            <DeleteCollection c={{ id: c.id, name: c.name }} canDelete={all.length > 1} />
          </div>
        )}
      </div>
    </>
  );
}
