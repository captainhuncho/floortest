import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/**
 * Prepare while it loads (page.tsx), in the folder page's layout: the cover (centred on phones, on the left from lg),
 * the label, name and two lines, the Download crate button, then track rows.
 */
export default function Loading() {
  return (
    <SkeletonFrame outer="page-gutter py-3 sm:py-6" className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5 lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start lg:gap-8 min-[1180px]:grid-cols-[260px_minmax(0,1fr)]">
      <SkBlock className="mx-auto size-40 rounded-[16px] lg:mx-0 lg:aspect-square lg:size-auto lg:w-full" />
      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        <div className="flex items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <SkLine className="h-2.5 w-14" />
            <SkBlock className="h-[26px] w-40 rounded-[8px]" />
            <SkLine className="w-44" />
            <SkLine className="w-36" />
          </div>
          <SkBlock className="size-12 shrink-0 rounded-full" />
        </div>
        <SkBlock className="h-12 rounded-[14px] lg:w-44" />
        <div className="flex flex-col">
          {["w-1/3", "w-1/2", "w-2/5", "w-1/4", "w-1/3"].map((w, i) => (
            <div key={i} className="flex min-h-16 items-center gap-3 border-t border-line first:border-t-0 lg:min-h-14">
              <SkLine className="w-4" />
              <div className="flex flex-1 flex-col gap-1.5">
                <SkLine className={w} />
                <SkLine className="h-2.5 w-2/5" />
              </div>
              <SkBlock className="size-6 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}
