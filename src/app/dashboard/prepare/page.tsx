import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canMarkPlayedOut } from "@/lib/played-out-prompt";
import { CARD, Chip, Icon, PageHead, SectionHead, StatTile } from "@/components/Kit";
import { ExportButton } from "../ExportButton";
import { loadRows } from "../rows";
import { ClearKept } from "./ClearKept";
import { KeptCards } from "./KeptCards";
import { GHOST_BTN } from "./buttons";
import { OfflineSave } from "./OfflineSave";

export const metadata = { title: "Prepare — FloorTest" };

/**
 * Everything you kept, ready to take to the booth, plus crate downloads (owner, 30 Oct: the redesign mocks). Three
 * counts on top, then the crate card (download, Files only, new batch) and the kept list. From 1280px the list sits on
 * the left and the crate and offline cards on the right; on phones the crate comes first, since downloading is the job.
 */
export default async function PrepareForSet() {
  const user = await requireUser();
  await trackUse(user.id, "prepare");
  const kept = await loadRows(user.id, { inSet: true });
  const canMark = canMarkPlayedOut(user);
  // Starting a new batch is for the owner and admins.
  const canClear = user.role !== "member";
  const n = kept.length;
  const downloaded = kept.filter((r) => r.downloaded).length;
  const prepped = kept.filter((r) => r.energy || r.cueCount).length;

  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4 sm:gap-5 xl:max-w-6xl">
        <PageHead label="Every track you keep lands here, ready to download with a Rekordbox playlist." title="Prepare" />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile icon="heart" label="Kept, ready" value={String(n)} />
          <StatTile icon="dl" label="Downloaded" value={String(downloaded)} chip={n ? <Chip>of {n}</Chip> : undefined} />
          {/* Phones: the third tile takes the whole row rather than leaving a gap. */}
          <div className="col-span-2 grid sm:col-span-1">
            <StatTile icon="star" label="Prepped" value={String(prepped)} chip={n ? <Chip>of {n}</Chip> : undefined} />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[auto_1fr] xl:items-start">
          {/* Every option visible, same size: people use different ones. Starting a new batch is quiet, and still confirms. */}
          <section aria-labelledby="crate-h" className={`${CARD} flex flex-col gap-2.5 p-3 xl:col-start-2 xl:row-start-1`}>
            <SectionHead id="crate-h" icon="prep" title="Download your crate" />
            <ExportButton
              collectionId={null}
              count={n}
              label="Download kept"
              icon="dl"
              align="start"
              showCount={false}
              buttonClassName="btn-lime w-full min-h-11 rounded-[13px]"
            />
            <div className={canClear ? "grid grid-cols-2 gap-2" : "grid"}>
              {n > 0 ? (
                // eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download, not a page
                <a href="/api/export?files=1" className={GHOST_BTN} title="The original audio files, no playlist or XML">
                  Files only
                </a>
              ) : (
                <span className={`pointer-events-none opacity-40 ${GHOST_BTN}`}>Files only</span>
              )}
              {canClear && <ClearKept count={n} />}
            </div>
            {canClear && <p className="text-[11px] leading-[1.45] text-faint">A new batch empties Prepare. Tracks stay Kept and still count toward your desk.</p>}
          </section>

          <section aria-labelledby="kept-h" className={`${CARD} flex min-w-0 flex-col gap-1.5 p-3 xl:col-start-1 xl:row-span-2 xl:row-start-1`}>
            <SectionHead
              id="kept-h"
              title={
                <>
                  Kept tracks <span className="text-[13px] font-medium text-mute tnum">{n}</span>
                </>
              }
              aside={
                canMark && n > 0 ? (
                  <Link href="/dashboard/played-out" className={`${GHOST_BTN} gap-1.5 px-3!`}>
                    <Icon name="check" className="size-4" />
                    Mark what I played
                  </Link>
                ) : undefined
              }
            />
            {n ? (
              <KeptCards rows={kept} canMark={canMark} />
            ) : (
              <p className="py-2 text-[12px] leading-[1.45] text-mute">
                Nothing ready for your set yet. Press Keep while reviewing in{" "}
                <Link href="/dashboard/review" className="text-bone underline underline-offset-4">
                  Queue
                </Link>{" "}
                and tracks show up here.
              </p>
            )}
          </section>

          <OfflineSave count={n} className="xl:col-start-2 xl:row-start-2" />
        </div>
      </div>
    </div>
  );
}
