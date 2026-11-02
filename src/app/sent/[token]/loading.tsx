import { CARD } from "@/components/Kit";
import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/** The sender's history while it loads: the logo, then the card of sent tracks, in page.tsx's own column. */
export default function Loading() {
  return (
    <SkeletonFrame
      outer="theme-system mx-auto min-h-dvh w-full max-w-[600px] bg-ink px-3.5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-6 sm:pt-16"
      className="flex flex-col gap-3"
    >
      <SkBlock className="mb-2 h-7 w-28 self-center rounded-[8px]" />
      <div className={`${CARD} flex flex-col p-3`}>
        <SkLine className="w-44" />
        <SkBlock className="mt-2 h-[30px] w-64 max-w-full rounded-[8px] sm:h-[34px]" />
        <SkLine className="mt-2 w-36" />
        <div className="mt-2.5 flex flex-col">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex min-h-14 items-center gap-3 border-t border-line py-2.5 first:border-t-0">
              <div className="flex flex-1 flex-col gap-1.5">
                <SkLine className="w-1/2" />
                <SkLine className="w-3/4" />
              </div>
              <SkLine className="w-20" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}
