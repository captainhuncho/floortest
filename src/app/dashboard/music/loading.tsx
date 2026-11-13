import { CARD } from "@/components/Kit";
import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/** My music while it loads: the page head and note, the Add tracks button, then the track list (page.tsx). */
export default function Loading() {
  return (
    <SkeletonFrame outer="page-gutter py-4 sm:py-7" className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-1.5">
        <SkLine className="w-24" />
        <SkBlock className="h-[22px] w-36 rounded-[8px]" />
        <SkLine className="mt-1 w-80 max-w-full" />
      </div>
      <SkBlock className="h-11 w-32 rounded-[12px]" />
      <div className={`${CARD} flex flex-col`}>
        {["w-1/3", "w-1/4", "w-2/5"].map((w) => (
          <div key={w} className="flex items-center gap-3 border-t border-line p-3 first:border-t-0">
            <SkBlock className="size-11 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkLine className={w} />
              <SkLine className="h-2.5 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}
