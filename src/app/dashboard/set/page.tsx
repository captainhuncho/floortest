import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { collectionsFor } from "@/lib/core";
import { ExportButton } from "../ExportButton";
import { loadRows, reviewHref } from "../rows";
import { TrackList } from "../TrackList";

export const metadata = { title: "Prepare for set — FloorTest" };

/** Everything you kept, ready to take to the booth, plus crate downloads. */
export default async function PrepareForSet() {
  const user = await requireUser();
  const [kept, collections] = await Promise.all([loadRows(user.id, { keptOnly: true }), collectionsFor(user.id)]);

  return (
    <div className="max-w-5xl px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Prepare for set</h1>
          <p className="mt-2 max-w-xl text-mute">Every track you keep lands here. Download them as a crate with a Rekordbox XML and playlist.</p>
        </div>
      </div>

      <section aria-labelledby="crates-h" className="mt-8">
        <h2 id="crates-h" className="label">Download a crate</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          <li className="card flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="font-semibold">All kept</p>
              <p className="text-sm text-mute">Across every collection</p>
            </div>
            <ExportButton collectionId={null} count={kept.length} label="Download" />
          </li>
          {collections.map((c) => (
            <li key={c.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link href={`/dashboard/collections/${c.id}`} className="font-semibold hover:underline">
                  {c.name}
                </Link>
                <p className="text-sm text-mute">
                  {c.kept} kept · {c.count} in folder
                </p>
              </div>
              <div className="flex gap-2">
                <ExportButton collectionId={c.id} count={c.kept} label="Kept" />
                <ExportButton collectionId={c.id} count={c.count} whole label="Whole" variant="ghost" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="kept-h" className="mt-10">
        <h2 id="kept-h" className="label">
          Kept tracks ({kept.length})
        </h2>
        <div className="mt-3">
          {kept.length ? (
            <TrackList rows={kept} selectedId={null} hrefFor={Object.fromEntries(kept.map((r) => [r.id, reviewHref(r.id)]))} />
          ) : (
            <p className="card p-6 text-mute">
              Nothing kept yet. Press Keep (K) while reviewing in{" "}
              <Link href="/dashboard" className="text-bone underline underline-offset-4">
                Submissions
              </Link>{" "}
              and tracks show up here.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
