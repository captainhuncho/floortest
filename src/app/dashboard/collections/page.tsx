import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { collectionsFor, isClosed } from "@/lib/core";
import { fmtDay } from "@/lib/format";
import { genresFor } from "@/lib/plans";
import { APP_URL } from "@/lib/mail";
import { CollectionTile, NewCollection } from "./CollectionForms";

export const metadata = { title: "Collections — FloorTest" };

export default async function Collections() {
  const user = await requireUser();
  const collections = await collectionsFor(user.id);
  const sharing = await switchOn("sharing");
  // Figma "03 Collections": a tile per callout, then a dashed tile to add one.
  return (
    <div className="max-w-5xl px-3 py-4 font-[family-name:var(--font-stage-mono)] sm:px-8 sm:py-6">
      <h1 className="text-[23px] font-bold text-bone sm:text-3xl">Collections</h1>
      <p className="mt-3.5 text-[11px] leading-[1.5] text-mute sm:text-sm">
        One per callout. Your link <span className="break-all text-lime">{APP_URL.replace(/^https?:\/\//, "")}/{user.handle}</span> sends new tracks to
        whichever collection is marked receiving. Reviewing happens in{" "}
        <Link href="/dashboard" className="text-bone underline underline-offset-4">
          Review Queue
        </Link>
        .
      </p>
      <ul className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {collections.map((c) => (
          <li key={c.id} className="contents">
            <CollectionTile
              c={{ id: c.id, name: c.name, closesAt: c.closes_at, closesLabel: c.closes_at ? fmtDay(c.closes_at) : null, count: c.count, needsReview: c.needs_review, kept: c.kept, briefWanted: c.brief_wanted, bpmMin: c.bpm_min, bpmMax: c.bpm_max, briefNote: c.brief_note, allowSharing: !!c.allow_sharing, sharingAvailable: sharing, genres: genresFor(c).custom ? genresFor(c).list : [] }}
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
    </div>
  );
}
