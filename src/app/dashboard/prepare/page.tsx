import { trackUse } from "@/lib/usage";
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
  await trackUse(user.id, "prepare");
  const kept = await loadRows(user.id, { inSet: true });

  // Figma "06 Prepare for Set".
  return (
    <div className="max-w-3xl px-3 py-3 sm:px-8 sm:py-6 md:max-w-6xl">
      <div className="md:flex md:items-start md:justify-between md:gap-8">
      <div>
      <p className="text-[11px] font-medium tracking-[0.5px] text-bone md:hidden">PREPARE FOR SET</p>
      <h1 className="text-xl font-bold text-bone sm:text-3xl md:text-[32px]">
        <span className="md:hidden">Prepare</span>
        <span className="hidden md:inline">Prepare for set</span>
      </h1>
      <p className="mt-3 max-w-md text-xs leading-[1.4] text-mute">Every track you keep lands here. Download a crate with a Rekordbox XML and playlist, or just the files.</p>
      </div>
      {/* One main action; the rarer ones (files only, clear) sit in a small menu so Clear can't be hit by accident. */}
      <div className="mt-4 flex items-start gap-2 md:mt-0 md:w-72 md:shrink-0">
        <div className="min-w-0 flex-1">
          <ExportButton
            collectionId={null}
            count={kept.length}
            label="Download crate"
            buttonClassName="btn-lime w-full rounded-lg py-2.5 text-xs font-bold disabled:opacity-40"
          />
        </div>
        <details className="group relative">
          <summary
            aria-label="More actions"
            className={`grid size-[38px] cursor-pointer list-none place-items-center rounded-lg border border-line bg-ink-3 text-lg leading-none text-bone hover:bg-ink-4 [&::-webkit-details-marker]:hidden ${kept.length ? "" : "pointer-events-none opacity-40"}`}
          >
            <span aria-hidden>⋯</span>
          </summary>
          <div className="card absolute right-0 top-full z-20 mt-2 w-60 p-1.5 shadow-2xl shadow-black/40">
            <a href="/api/export?files=1" className="block rounded-md px-3 py-2.5 text-sm text-bone hover:bg-ink-4">
              Download files only
              <span className="block text-xs text-mute">The {kept.length} original{kept.length === 1 ? "" : "s"}, no playlist or XML</span>
            </a>
            <div className="my-1 border-t border-line" />
            <ClearKept count={kept.length} />
          </div>
        </details>
      </div>
      </div>

      <section aria-labelledby="kept-h" className="mt-3 pt-2 md:mt-6">
        <h2 id="kept-h" className="text-[11px] font-bold tracking-[1px] text-faint">
          KEPT TRACKS ({kept.length})
        </h2>
        <div className="mt-3">
          {kept.length ? (
            <KeptCards rows={kept} />
          ) : (
            <p className="rounded-xl border border-line bg-ink-3 p-4 text-xs text-mute">
              Nothing ready for your set yet. Press Keep while reviewing in{" "}
              <Link href="/dashboard/review" className="text-bone underline underline-offset-4">
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
