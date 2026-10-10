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
import { DownloadActions } from "../../DownloadActions";
import { ListRows, type ListRow } from "../../list/ListRows";
import { CollectionDetailHeader, DeleteCollection, EditCollectionInfo } from "../CollectionForms";
import { Teammates } from "../Teammates";
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
  };

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-4 pt-1 text-bone md:hidden">
        <CollectionDetailHeader c={editable} receiving={receiving} closed={isClosed(c)} canDelete={all.length > 1} />
        {(genres.custom || c.bpm_min || c.brief_note || c.brief_wanted) && (
          <section className="flex flex-col gap-2.5 card p-3.5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-faint">GENRES</p>
                <p className="text-[12px]">{genres.custom ? genres.list.join(", ") : c.brief_wanted || "Any"}</p>
              </div>
              {c.bpm_min && c.bpm_max && (
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-bold text-faint">BPM</p>
                  <p className="text-[12px]">
                    {c.bpm_min}-{c.bpm_max}
                  </p>
                </div>
              )}
            </div>
            {c.brief_note && (
              <>
                <hr className="border-line" />
                <div>
                  <p className="text-[11px] font-bold text-faint">BRIEF</p>
                  <p className="text-[12px] italic">&ldquo;{c.brief_note}&rdquo;</p>
                </div>
              </>
            )}
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
        <section className="grid grid-cols-[1.4fr_0.8fr_1.6fr] gap-6 card px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase text-faint">Genres</p>
            <p className="mt-1 truncate text-[12px]">{genres.custom ? genres.list.join(", ") : c.brief_wanted || "Any"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-faint">BPM range</p>
            <p className="mt-1 text-[12px]">{c.bpm_min && c.bpm_max ? `${c.bpm_min} – ${c.bpm_max} BPM` : "Any"}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase text-faint">Submission brief</p>
            <p className="mt-1 truncate text-[12px] italic">{c.brief_note ? `“${c.brief_note}”` : "—"}</p>
          </div>
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
        {team && (
          <div className="mx-4 mb-4 md:mx-0">
            <Teammates collectionId={c.id} members={team} max={MAX_MEMBERS} />
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
