import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { collectionsFor } from "@/lib/core";
import { ExportButton } from "../../ExportButton";
import { loadRows, reviewHref } from "../../rows";
import { TrackList } from "../../TrackList";

export const metadata = { title: "Collection — FloorTest" };

/** A collection as a folder: every track in it, whatever its status. */
export default async function CollectionFolder({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const c = (await collectionsFor(user.id)).find((x) => String(x.id) === id);
  if (!c) notFound();
  const rows = await loadRows(user.id, { collectionId: c.id });

  return (
    <div className="max-w-5xl px-4 py-6 sm:px-8">
      <Link href="/dashboard/collections" className="text-sm text-mute hover:text-bone">
        ← Collections
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {c.name}
            {c.id === user.active_collection_id && <span className="chip ml-3 align-middle border-lime/50 text-lime">Receiving</span>}
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
  );
}
