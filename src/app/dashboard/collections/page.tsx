import { trackUse } from "@/lib/usage";
import { canCapCallouts } from "@/lib/desk";
import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { collectionsFor, isClosed } from "@/lib/desk";
import { fmtDay } from "@/lib/format";
import { genresFor } from "@/lib/plans";
import { briefItems } from "@/lib/brief";
import { APP_URL } from "@/lib/mail";
import { CollectionTile, NewCollection } from "./CollectionForms";
import { sharedLinksFor } from "@/lib/share-links";
import { PageTitle } from "@/components/PageTitle";

export const metadata = { title: "Collections — FloorTest" };

/** A tile per callout (artwork, Receiving badge, play), then a dashed tile to add one (owner, 14 Oct: the grid stays). */
export default async function Collections() {
  const user = await requireUser();
  await trackUse(user.id, "collections");
  const collections = await collectionsFor(user.id);
  const sharing = await switchOn("sharing");
  const viaLinks = await sharedLinksFor(user);
  const canManage = user.role !== "member";
  // The receiving collection first, then open callouts (newest first), then closed ones (newest first).
  const rank = (c: (typeof collections)[number]) => (c.id === user.active_collection_id ? 0 : isClosed(c) ? 2 : 1);
  const ordered = [...collections].sort((a, b) => rank(a) - rank(b) || b.created_at - a.created_at);
  return (
    <div className="page-gutter py-4 sm:py-6">
      <PageTitle>Collections</PageTitle>
      <p className="mt-3.5 max-w-3xl text-xs leading-relaxed text-mute sm:text-sm">
        One per callout. Your link <span className="break-all text-lime">{APP_URL.replace(/^https?:\/\//, "")}/{user.handle}</span> fills the one
        that&apos;s receiving. Review in{" "}
        <Link href="/dashboard/review" className="text-bone underline underline-offset-4">
          the Queue
        </Link>
        .
      </p>
      <ul className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
            <NewCollection tile />
          </li>
        )}
      </ul>
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
