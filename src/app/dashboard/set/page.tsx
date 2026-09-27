import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ExportButton } from "../ExportButton";
import { loadRows, reviewHref } from "../rows";
import { TrackList } from "../TrackList";
import { ClearKept } from "./ClearKept";

export const metadata = { title: "Prepare for set — FloorTest" };

/** Everything you kept, ready to take to the booth, plus crate downloads. */
export default async function PrepareForSet() {
  const user = await requireUser();
  const kept = await loadRows(user.id, { inSet: true });

  return (
    <div className="max-w-5xl px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Prepare for set</h1>
          <p className="mt-2 max-w-xl text-mute">Every track you keep lands here. Download a crate with a Rekordbox XML and playlist, or just the files.</p>
        </div>
        <div className="flex flex-col items-stretch gap-2">
          <ExportButton collectionId={null} count={kept.length} label="Download kept crate" />
          {kept.length > 0 ? (
            <a href="/api/export?files=1" className="btn-ghost btn-sm" title="Just the original audio files, no Rekordbox XML or playlist">
              Download files ({kept.length})
            </a>
          ) : (
            <span className="btn-ghost btn-sm pointer-events-none opacity-40">Download files (0)</span>
          )}
          <ClearKept count={kept.length} />
        </div>
      </div>

      <section aria-labelledby="kept-h" className="mt-8">
        <h2 id="kept-h" className="label">
          Kept tracks ({kept.length})
        </h2>
        <div className="mt-3">
          {kept.length ? (
            <TrackList rows={kept} selectedId={null} hrefFor={Object.fromEntries(kept.map((r) => [r.id, reviewHref(r.id)]))} />
          ) : (
            <p className="card p-6 text-mute">
              Nothing in this batch yet. Press Keep (K) while reviewing in{" "}
              <Link href="/dashboard" className="text-bone underline underline-offset-4">
                Review Queue
              </Link>{" "}
              and tracks show up here.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
