import { trackUse } from "@/lib/usage";
import { canCapCallouts } from "@/lib/desk";
import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { collectionsFor, isClosed } from "@/lib/desk";
import { fmtDay } from "@/lib/format";
import { genresFor } from "@/lib/plans";
import { APP_URL } from "@/lib/mail";
import { CollectionTile, NewCollection } from "./CollectionForms";
import { sharedWith } from "@/lib/team";

export const metadata = { title: "Collections — FloorTest" };

export default async function Collections() {
  const user = await requireUser();
  await trackUse(user.id, "collections");
  const collections = await collectionsFor(user.id);
  const sharing = await switchOn("sharing");
  const shared = await sharedWith(user.id);
  // Figma "03 Collections": a tile per callout, then a dashed tile to add one.
  return (
    <div className="max-w-5xl px-3 py-4 sm:px-8 sm:py-6">
      <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone">Collections</h1>
      <p className="mt-3.5 text-[11px] leading-[1.5] text-mute sm:text-sm">
        One per callout. Your link <span className="break-all text-lime">{APP_URL.replace(/^https?:\/\//, "")}/{user.handle}</span> sends new tracks to
        whichever collection is marked receiving. Reviewing happens in{" "}
        <Link href="/dashboard/review" className="text-bone underline underline-offset-4">
          Review Queue
        </Link>
        .
      </p>
      <ul className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {collections.map((c) => (
          <li key={c.id} className="contents">
            <CollectionTile
              c={{ id: c.id, name: c.name, closesAt: c.closes_at, closesLabel: c.closes_at ? fmtDay(c.closes_at) : null, count: c.count, needsReview: c.needs_review, kept: c.kept, briefWanted: c.brief_wanted, bpmMin: c.bpm_min, bpmMax: c.bpm_max, briefNote: c.brief_note, allowSharing: !!c.allow_sharing, sharingAvailable: sharing, genres: genresFor(c).custom ? genresFor(c).list : [], maxTracks: c.max_tracks, full: !!c.full_at, art: c.art_key ? `/api/collection-art/${c.id}?v=${encodeURIComponent(c.art_key)}` : null, canCap: canCapCallouts(user.plan) }}
              receiving={c.id === user.active_collection_id}
              closed={isClosed(c)}
              canDelete={collections.length > 1}
            />
          </li>
        ))}
        <li className="contents">
          <NewCollection tile />
        </li>
      </ul>
      {shared.length > 0 && (
        <section aria-labelledby="shared-h" className="mt-8">
          <h2 id="shared-h" className="text-[15px] font-bold text-bone">
            Shared with you
          </h2>
          <p className="mt-1 text-[11px] text-mute sm:text-sm">Listen and vote keep or pass. The owner makes the call.</p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shared.map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard/shared/${c.id}`} className="flex h-full flex-col gap-1 card p-3.5 text-bone hover:border-faint">
                  <span className="truncate text-[14px] font-bold">{c.name}</span>
                  <span className="truncate text-[11px] text-mute">from {c.owner_name}</span>
                  <span className="mt-auto pt-2 text-[11px] font-bold tnum">
                    {c.unvoted} to vote <span className="font-normal text-faint">· {c.count} total</span>
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
