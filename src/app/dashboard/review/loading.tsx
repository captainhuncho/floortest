import { CARD } from "@/components/Kit";
import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/**
 * The Review Queue while it loads, in page.tsx's shape: the head with Queue/List, the status tabs and search, then the
 * open track's card and the list. From 1280px the list takes the narrow left column and the track the room on the right;
 * below that the track comes first, as on the page.
 */
export default function Loading() {
  return (
    <SkeletonFrame outer="page-gutter py-4 sm:py-6" className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-3.5 xl:max-w-[1360px]">
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <SkLine className="w-28" />
            <SkBlock className="h-[22px] w-40 rounded-[8px]" />
          </div>
          <SkBlock className="h-11 w-[118px] rounded-[14px]" />
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <SkBlock className="h-[52px] rounded-[16px] lg:w-[560px]" />
          <SkBlock className="h-11 rounded-xl lg:max-w-[520px] lg:flex-1" />
        </div>
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[380px_minmax(0,1fr)] xl:items-start">
        <div className={`${CARD} flex flex-col gap-3 p-4 xl:col-start-2 xl:row-start-1`}>
          <div className="flex items-center gap-3">
            <SkBlock className="size-11 shrink-0 rounded-[12px]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkBlock className="h-4 w-40 rounded-full" />
              <SkLine className="h-2.5 w-56 max-w-full" />
            </div>
          </div>
          <SkLine className="w-48" />
          <SkBlock className="h-[88px] rounded-[12px]" />
          <div className="grid grid-cols-2 gap-2">
            <SkBlock className="h-[52px] rounded-[14px]" />
            <SkBlock className="h-[52px] rounded-[14px]" />
          </div>
        </div>
        <div className={`${CARD} flex flex-col p-3 xl:col-start-1 xl:row-start-1`}>
          <SkLine className="mb-1 w-28" />
          {["w-1/3", "w-2/5", "w-1/4"].map((w) => (
            <div key={w} className="flex min-h-[61px] items-center gap-3 border-t border-line first:border-t-0">
              <SkBlock className="size-11 shrink-0 rounded-[12px]" />
              <div className="flex flex-1 flex-col gap-1.5">
                <SkLine className={w} />
                <SkLine className="h-2.5 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}
