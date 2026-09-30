import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ExportButton } from "../ExportButton";
import { loadRows } from "../rows";
import { ClearKept } from "./ClearKept";
import { KeptCards } from "./KeptCards";

export const metadata = { title: "Prepare for set — FloorTest" };

/** Everything you kept, ready to take to the booth, plus crate downloads. */
export default async function PrepareForSet() {
  const user = await requireUser();
  const kept = await loadRows(user.id, { inSet: true });

  // Figma "06 Prepare for Set".
  return (
    <div className="max-w-3xl px-3 py-3 font-[family-name:var(--font-stage-mono)] sm:px-8 sm:py-6 md:max-w-6xl">
      <div className="md:flex md:items-start md:justify-between md:gap-8">
      <div>
      <p className="text-[8px] font-medium tracking-[0.5px] text-white md:hidden">PREPARE FOR SET</p>
      <h1 className="text-xl font-bold text-bone sm:text-3xl md:text-[32px]">
        <span className="md:hidden">Prepare</span>
        <span className="hidden md:inline">Prepare for set</span>
      </h1>
      <p className="mt-3 max-w-md text-xs leading-[1.4] text-mute">Every track you keep lands here. Download a crate with a Rekordbox XML and playlist, or just the files.</p>
      </div>
      <div className="mt-3 flex flex-col gap-2 md:mt-0 md:w-56 md:shrink-0">
        <ExportButton
          collectionId={null}
          count={kept.length}
          label="Download kept crate"
          buttonClassName="w-full rounded-lg bg-white py-2.5 text-xs font-bold text-ink disabled:opacity-40"
        />
        {kept.length > 0 ? (
          <a href="/api/export?files=1" className="rounded-lg border border-line py-2.5 text-center text-xs font-medium text-mute" title="Just the original audio files, no Rekordbox XML or playlist">
            Download files ({kept.length})
          </a>
        ) : (
          <span className="pointer-events-none rounded-lg border border-line py-2.5 text-center text-xs font-medium text-mute opacity-40">Download files (0)</span>
        )}
        <ClearKept count={kept.length} />
      </div>
      </div>

      <section aria-labelledby="kept-h" className="mt-3 pt-2 md:mt-6">
        <h2 id="kept-h" className="text-[10px] font-bold tracking-[1px] text-faint">
          KEPT TRACKS ({kept.length})
        </h2>
        <div className="mt-3">
          {kept.length ? (
            <KeptCards rows={kept} />
          ) : (
            <p className="rounded-xl border border-line bg-ink-3 p-4 text-xs text-mute">
              Nothing in this batch yet. Press Keep while reviewing in{" "}
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
