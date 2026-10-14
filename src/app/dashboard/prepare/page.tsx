import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageTitle } from "@/components/PageTitle";
import { DownloadActions } from "../DownloadActions";
import { loadRows } from "../rows";
import { ClearKept } from "./ClearKept";
import { KeptCards } from "./KeptCards";
import { OfflineSave } from "./OfflineSave";

export const metadata = { title: "Prepare — FloorTest" };

/** Everything you kept, ready to take to the booth, plus crate downloads. */
export default async function PrepareForSet() {
  const user = await requireUser();
  await trackUse(user.id, "prepare");
  const kept = await loadRows(user.id, { inSet: true });

  // Figma "06 Prepare for Set".
  return (
    <div className="page-gutter py-3 sm:py-6">
      <div className="md:flex md:items-start md:justify-between md:gap-8">
        <PageTitle sub="Every track you keep lands here. Download a crate with a Rekordbox XML and playlist, or just the files." className="max-w-md">
          Prepare
        </PageTitle>
      {/* Every option visible, same size: people use different ones. Starting a new batch is a quiet secondary action, and still confirms. */}
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
                Queue
              </Link>{" "}
              and tracks show up here.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
