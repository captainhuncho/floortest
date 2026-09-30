import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { collectionsFor, isClosed } from "@/lib/core";
import { q, type Track } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { genresFor, MIX_STATUS } from "@/lib/plans";
import { ExportButton } from "../../ExportButton";
import { ListRows, type ListRow } from "../../list/ListRows";
import { loadRows, reviewHref } from "../../rows";
import { TrackList } from "../../TrackList";
import { CollectionDetailHeader } from "../CollectionForms";

export const metadata = { title: "Collection — FloorTest" };

/** A collection as a folder: every track in it, whatever its status. Phones get the Figma "04 Collection Detail". */
export default async function CollectionFolder({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const all = await collectionsFor(user.id);
  const c = all.find((x) => String(x.id) === id);
  if (!c) notFound();
  const rows = await loadRows(user.id, { collectionId: c.id });
  const receiving = c.id === user.active_collection_id;
  const genres = genresFor(c);

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
    genres: genres.custom ? genres.list : [],
  };

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-4 pt-1 font-[family-name:var(--font-stage-mono)] text-[#f1f1eb] md:hidden">
        <CollectionDetailHeader c={editable} receiving={receiving} closed={isClosed(c)} canDelete={all.length > 1} />
        {(genres.custom || c.bpm_min || c.brief_note || c.brief_wanted) && (
          <section className="flex flex-col gap-2.5 rounded-xl border border-[#2c2e29] bg-[#1e1f1b] p-3.5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-[#5f6158]">GENRES</p>
                <p className="text-[12px]">{genres.custom ? genres.list.join(", ") : c.brief_wanted || "Any"}</p>
              </div>
              {c.bpm_min && c.bpm_max && (
                <div className="shrink-0 text-right">
                  <p className="text-[9px] font-bold text-[#5f6158]">BPM</p>
                  <p className="text-[12px]">
                    {c.bpm_min}-{c.bpm_max}
                  </p>
                </div>
              )}
            </div>
            {c.brief_note && (
              <>
                <hr className="border-[#2c2e29]" />
                <div>
                  <p className="text-[9px] font-bold text-[#5f6158]">BRIEF</p>
                  <p className="text-[12px] italic">&ldquo;{c.brief_note}&rdquo;</p>
                </div>
              </>
            )}
          </section>
        )}
        <p className="flex gap-2 text-[10px] font-bold">
          <span className="text-[#a3a69b]">{c.needs_review} NEED REVIEW</span>
          <span className="font-normal text-[#5f6158]">·</span>
          <span className="text-white">{c.kept} KEPT</span>
          <span className="font-normal text-[#5f6158]">·</span>
          <span>{c.count} TOTAL</span>
        </p>
        {cards.length ? (
          <ListRows rows={cards} statusTag />
        ) : (
          <p className="rounded-xl border border-[#2c2e29] bg-[#1e1f1b] p-4 text-[12px] text-[#a3a69b]">
            This folder is empty. Tracks sent while it&apos;s receiving land here.
          </p>
        )}
      </div>

      <div className="hidden max-w-5xl px-4 py-6 sm:px-8 md:block">
        <Link href="/dashboard/collections" className="text-sm text-mute hover:text-bone">
          ← Collections
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {c.name}
              {receiving && <span className="chip ml-3 align-middle border-lime/50 text-lime">Receiving</span>}
            </h1>
            <p className="mt-2 text-mute">
              {c.count} track{c.count === 1 ? "" : "s"} · {c.needs_review} need review · {c.kept} kept
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.needs_review > 0 && (
              <Link href={`/dashboard?view=queue&c=${c.id}`} className="btn-ghost btn-sm">
                Review ({c.needs_review})
              </Link>
            )}
            <ExportButton collectionId={c.id} count={c.count} whole label="Download collection" />
          </div>
        </div>
        <div className="mt-6">
          {rows.length ? (
            <TrackList rows={rows} selectedId={null} hrefFor={Object.fromEntries(rows.map((r) => [r.id, reviewHref(r.id)]))} />
          ) : (
            <p className="card p-6 text-mute">This folder is empty. Tracks sent while it&apos;s receiving land here.</p>
          )}
        </div>
      </div>
    </>
  );
}
