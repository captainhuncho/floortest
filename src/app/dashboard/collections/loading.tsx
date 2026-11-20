import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/**
 * Collections while they load (page.tsx): the heading, the tab header (the two tabs, + Add on the right from md),
 * search, then the folders: rows with a small cover on phones, a grid of covers from md.
 */
export default function Loading() {
  return (
    <SkeletonFrame outer="page-gutter py-4 sm:py-7" className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5 sm:gap-6">
      <SkBlock className="h-[26px] w-36 rounded-[8px]" />
      <div className="flex items-center justify-between gap-3">
        <SkBlock className="h-[54px] w-full rounded-[14px] md:w-[260px]" />
        <SkBlock className="hidden h-11 w-24 rounded-[13px] md:block" />
      </div>
      <SkBlock className="h-11 rounded-[12px] md:w-64" />
      <div className="flex flex-col md:grid md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-x-4 md:gap-y-6">
        {["w-1/3", "w-1/2", "w-2/5", "w-1/4"].map((w) => (
          <div key={w} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0 md:flex-col md:items-stretch md:gap-2 md:border-t-0 md:py-0">
            <SkBlock className="size-14 shrink-0 rounded-[10px] md:aspect-square md:size-auto md:w-full md:rounded-[14px]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkLine className={`${w} md:w-2/3`} />
              <SkLine className="h-2.5 w-2/5 md:w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}
