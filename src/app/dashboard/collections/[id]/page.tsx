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
import { genresFor, MIX_STATUS, RELEASE_STATUS } from "@/lib/plans";
import { briefItems } from "@/lib/brief";
import { DownloadActions } from "../../DownloadActions";
import { ListRows, type ListRow } from "../../list/ListRows";
import { CollectionDetailHeader, DeleteCollection, EditCollectionInfo } from "../CollectionForms";
import { OwnerUpload } from "../OwnerUpload";
import { ShareLinks, type ShareLinkView } from "../ShareLinks";
import { linksFor, sharingOn } from "@/lib/share-links";

export const metadata = { title: "Collection — FloorTest" };

/** "6 Oct", with the year only when it isn't this year. */
function shortDay(ts: number, timeZone?: string) {
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear();
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric", timeZone });
}

/**
 * A collection as a folder: the title, one readout line (where it stands and what's in it), the brief, then every track
 * in it as the shared TrackRow, whatever its status. One layout for every width; phones swap the title row for the
 * Figma "04 Collection Detail" header (back, options menu, edit in place).
 */
export default async function CollectionFolder({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await trackUse(user.id, "collection");
  const { id } = await params;
  const all = await collectionsFor(user.id);
  const c = all.find((x) => String(x.id) === id);
  if (!c) notFound();
  const receiving = c.id === user.active_collection_id;
  const closed = isClosed(c);
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
    genre: t.genre || null,
    bpm: t.bpm,
    releaseLabel: RELEASE_STATUS[t.release_status as keyof typeof RELEASE_STATUS] ?? null,
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
  // The deadline lives in the readout line; the brief keeps what senders are asked for.
  const brief = editable.brief.filter((b) => b.key !== "deadline");

  // Where it stands: "Receiving · closes 20 Oct", "Closed 6 Oct", "Full", "Not receiving". Phones already show the
  // state word in their header, so there only the date part shows.
  const day = c.closes_at ? shortDay(c.closes_at, user.tz) : null;
  const state = c.full_at ? "Full" : closed ? (day ? null : "Closed") : receiving ? "Receiving" : "Not receiving";
  const when = c.full_at || !day ? null : closed ? `Closed ${day}` : `Closes ${day}`;
  const counts: [number, string][] = [
    [c.needs_review, "to review"],
    [c.kept, "kept"],
    [c.count, "received"],
  ];

  return (
    <>
      <div className="page-gutter flex flex-col gap-4 pb-5 pt-1 text-bone md:pt-6">
        <div className="flex flex-col gap-3 md:hidden">
          <CollectionDetailHeader c={editable} receiving={receiving} closed={closed} canManage={admin} />
        </div>

        <div className="hidden md:block">
          <p className="text-[11px] text-faint">
            <Link href="/dashboard/collections" className="hover:text-bone">
              ← Collections
            </Link>{" "}
            / <span className="text-bone">{c.name}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <h1 className="page-title min-w-0">{c.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <EditCollectionInfo c={editable} receiving={receiving} closed={closed} canManage={admin} />
              <DownloadActions collectionId={c.id} crateName={c.name} count={c.count} size="sm" />
            </div>
          </div>
        </div>

        {/* One readout line for every width: where the collection stands | what's in it. */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold uppercase tracking-[0.5px] text-mute tnum md:-mt-1">
          {state && <span className="max-md:hidden">{state}</span>}
          {state && when && (
            <span aria-hidden className="font-normal text-faint max-md:hidden">
              ·
            </span>
          )}
          {when && <span>{when}</span>}
          {(state || when) && (
            <span aria-hidden className={`font-normal text-faint ${when ? "" : "max-md:hidden"}`}>
              |
            </span>
          )}
          {counts.map(([n, label], i) => (
            <span key={label} className="contents">
              {i > 0 && (
                <span aria-hidden className="font-normal text-faint">
                  ·
                </span>
              )}
              <span>
                <span className="text-bone">{n}</span> {label}
              </span>
            </span>
          ))}
        </p>

        {brief.length > 0 ? (
          <section aria-label="Brief" className="card px-4 py-3.5">
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              {brief.map((b) => (
                <div key={b.key} className={`min-w-0 ${b.key === "note" ? "basis-full lg:basis-auto lg:flex-1" : ""}`}>
                  <dt className="text-[11px] font-bold uppercase text-faint">{b.label}</dt>
                  <dd className={`mt-1 text-[12px] ${b.key === "note" ? "italic" : ""}`}>{b.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : admin ? (
          <p className="text-[12px] text-mute">No brief yet. Use Edit collection to add BPM, genres, what you want and a note for senders.</p>
        ) : null}
      </div>

      {/* One list for every screen size, so keyboard shortcuts and the player are registered once. */}
      <div className="page-gutter pb-4">
        {admin && (
          <div className="mb-4">
            <OwnerUpload collectionId={c.id} collectionName={c.name} />
          </div>
        )}
        {links && (
          <div className="mb-4">
            <ShareLinks collectionId={c.id} links={links as ShareLinkView[]} sharedTracks={sharedTracks} at={now()} />
          </div>
        )}
        {cards.length ? (
          <ListRows rows={cards} statusTag collections={all.map((x) => ({ id: x.id, name: x.name }))} />
        ) : (
          <p className="card p-4 text-[12px] text-mute">This folder is empty. Tracks sent while it&apos;s receiving land here.</p>
        )}
        {admin && (
          <div className="mt-8">
            <DeleteCollection c={{ id: c.id, name: c.name }} canDelete={all.length > 1} />
          </div>
        )}
      </div>
    </>
  );
}
