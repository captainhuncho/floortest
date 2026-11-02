import { CARD } from "@/components/Kit";
import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/** One collection card (CollectionTile): cover and name, the three figures, then the link box on the receiving one. */
function Tile({ receiving }: { receiving?: boolean }) {
  return (
    <div className={`${CARD} flex flex-col gap-2.5 p-3`}>
      <div className="flex items-center gap-2.5">
        <SkBlock className="size-[38px] shrink-0 rounded-[10px]" />
        <div className="flex flex-1 flex-col gap-1.5">
          <SkLine className="w-1/2" />
          <SkLine className="h-2.5 w-2/5" />
        </div>
        <SkBlock className="size-11 shrink-0 rounded-[12px]" />
      </div>
      <div className="grid grid-cols-3 gap-2 py-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <SkLine className="h-2.5 w-14" />
            <SkLine className="h-4 w-5" />
          </div>
        ))}
      </div>
      {receiving && <SkBlock className="h-[52px] rounded-[14px]" />}
      <SkLine className="h-2.5 w-28" />
    </div>
  );
}

/**
 * Collections while they load: the page head, the cards in page.tsx's grid (one column on phones, two from sm, three
 * from xl), then the receiving collection's track list. A collection's own page keeps the desk's general skeleton
 * ([id]/loading.tsx).
 */
export default function Loading() {
  return (
    <SkeletonFrame outer="page-gutter py-4 sm:py-7" className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-1.5">
        <SkLine className="w-24" />
        <SkBlock className="h-[22px] w-36 rounded-[8px]" />
        <SkLine className="mt-1 w-80 max-w-full" />
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile receiving />
        <Tile />
        <div className="hidden min-h-[150px] rounded-[18px] border border-dashed border-line-2 xl:block" />
      </div>
      <div className={`${CARD} flex flex-col gap-3 p-3`}>
        <SkLine className="w-40" />
        {["w-1/4", "w-1/3", "w-1/5"].map((w) => (
          <div key={w} className="flex items-center gap-3 border-t border-line pt-3 first:border-t-0">
            <div className="flex flex-1 flex-col gap-1.5">
              <SkLine className={w} />
              <SkLine className="h-2.5 w-2/5" />
            </div>
            <SkLine className="w-20" />
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}
