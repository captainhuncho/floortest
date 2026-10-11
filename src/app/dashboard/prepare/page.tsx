import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { DownloadActions } from "../DownloadActions";
import { loadRows } from "../rows";
import { ClearKept } from "./ClearKept";
import { KeptCards } from "./KeptCards";
import { OfflineSave } from "./OfflineSave";

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
      <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone">
        <span className="md:hidden">Prepare</span>
        <span className="hidden md:inline">Prepare for set</span>
      </h1>
      <p className="mt-3 max-w-md text-xs leading-[1.4] text-mute">Every track you keep lands here. Download a crate with a Rekordbox XML and playlist, or just the files.</p>
      </div>
      {/* Every option visible, same size: people use different ones. Clear is outlined red, and still confirms. */}
      <DownloadActions count={kept.length} extra={user.role !== "member" ? <ClearKept count={kept.length} /> : undefined} />
      </div>
      <OfflineSave count={kept.length} />

      <section aria-labelledby="kept-h" className="mt-3 pt-2 md:mt-6">
        <h2 id="kept-h" className="text-[11px] font-bold tracking-[1px] text-faint">
          KEPT TRACKS ({kept.length})
        </h2>
        <div className="mt-3">
          {kept.length ? (
            <KeptCards rows={kept} />
          ) : (
            <p className="card p-4 text-xs text-mute">
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
