import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/**
 * Collections while they load (page.tsx): the page head and New folder, search and the All / Callouts / Projects
 * filter, then the folders: rows with a small cover on phones, a grid of covers from md.
 */
export default function Loading() {
  return (
    <SkeletonFrame outer="page-gutter py-4 sm:py-7" className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5 sm:gap-6">
      <div className="flex items-center justify-between gap-3">
        <SkBlock className="h-[26px] w-36 rounded-[8px]" />
        <SkBlock className="size-11 rounded-full md:w-32 md:rounded-[12px]" />
      </div>
      <div className="flex flex-col gap-2 md:flex-row-reverse md:items-center md:justify-between">
        <SkBlock className="h-11 rounded-[12px] md:w-64" />
        <SkBlock className="h-11 w-56 rounded-[12px]" />
      </div>
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
