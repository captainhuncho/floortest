import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { collectionsFor, isClosed } from "@/lib/core";
import { fmtDay } from "@/lib/format";
import { genresFor } from "@/lib/plans";
import { APP_URL } from "@/lib/mail";
import { CollectionCard, NewCollection } from "./CollectionForms";

export const metadata = { title: "Collections — FloorTest" };

export default async function Collections() {
  const user = await requireUser();
  const collections = await collectionsFor(user.id);
  return (
    <div className="max-w-4xl px-4 py-6 sm:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Collections</h1>
      <p className="mt-2 max-w-xl text-mute">
        One per callout. Your link <span className="font-mono text-bone">{APP_URL.replace(/^https?:\/\//, "")}/{user.handle}</span> sends new
        tracks to whichever collection is marked <em className="not-italic text-lime">receiving</em>. Reviewing happens in{" "}
        <Link href="/dashboard" className="text-bone underline underline-offset-4">
          Review Queue
        </Link>
        .
      </p>
      <ul className="mt-8 space-y-3">
        {collections.map((c) => (
          <li key={c.id}>
            <CollectionCard
              c={{ id: c.id, name: c.name, closesAt: c.closes_at, closesLabel: c.closes_at ? fmtDay(c.closes_at) : null, count: c.count, needsReview: c.needs_review, kept: c.kept, briefWanted: c.brief_wanted, bpmMin: c.bpm_min, bpmMax: c.bpm_max, briefNote: c.brief_note, genres: genresFor(c).custom ? genresFor(c).list : [] }}
              receiving={c.id === user.active_collection_id}
              closed={isClosed(c)}
              canDelete={collections.length > 1}
            />
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <NewCollection />
      </div>
    </div>
  );
}
