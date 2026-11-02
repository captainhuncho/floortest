import { CARD } from "@/components/Kit";
import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/**
 * The receipt while it loads (opened from the sender's history, or a slow first load): the same ~600px column of cards
 * as page.tsx, the status card on top (lock line, headline, the track with its waveform) and the history card below.
 */
export default function Loading() {
  return (
    <SkeletonFrame
      outer="theme-system mx-auto min-h-dvh max-w-[600px] bg-ink px-3.5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-10"
      className="flex flex-col gap-3"
    >
      <div className={`${CARD} flex flex-col gap-3 p-3`}>
        <SkLine className="w-40" />
        <div className="flex flex-col gap-2">
          <SkBlock className="h-7 w-3/4 rounded-[8px]" />
          <SkLine className="w-2/3" />
        </div>
        <div className="flex flex-col gap-2.5 border-t border-dashed border-line-2 pt-3">
          <div className="flex items-center gap-2.5">
            <SkBlock className="size-[38px] shrink-0 rounded-[10px]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkLine className="w-1/2" />
              <SkLine className="w-2/3" />
            </div>
          </div>
          <SkBlock className="h-8 rounded-[8px]" />
        </div>
      </div>
      <div className={`${CARD} flex flex-col gap-5 p-3`}>
        <div className="flex items-center gap-2">
          <SkBlock className="size-8 rounded-[10px]" />
          <SkLine className="w-32" />
        </div>
        {["w-1/2", "w-2/5", "w-3/5", "w-1/3"].map((w) => (
          <div key={w} className="flex items-center gap-3">
            <SkBlock className="size-3 shrink-0 rounded-full" />
            <SkLine className={w} />
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}
