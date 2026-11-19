import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/**
 * Projects while it loads (page.tsx, option 63 A): the Collections heading, the bar (filter, room line, tools), the
 * tiles two a row on phones and up to five on a laptop, then a few track rows.
 */
export default function Loading() {
  return (
    <SkeletonFrame outer="page-gutter py-4 sm:py-7" className="mx-auto flex w-full min-w-0 max-w-[1040px] flex-col gap-5 sm:gap-6">
      <SkBlock className="h-[26px] w-36 rounded-[8px]" />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <SkBlock className="h-11 w-56 rounded-[12px]" />
        <SkLine className="w-44 md:flex-1" />
        <div className="flex gap-2">
          <SkBlock className="h-11 w-32 rounded-[12px]" />
          <SkBlock className="h-11 w-36 rounded-[12px]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:gap-x-4 md:gap-y-6 lg:grid-cols-4 xl:grid-cols-5">
        {["w-2/3", "w-1/2", "w-3/5", "w-2/5"].map((w) => (
          <div key={w} className="flex flex-col gap-2">
            <SkBlock className="aspect-square w-full rounded-[14px]" />
            <SkLine className={w} />
            <SkLine className="h-2.5 w-1/2" />
          </div>
        ))}
      </div>
      <div className="flex flex-col">
        {["w-1/2", "w-2/5"].map((w) => (
          <div key={w} className="flex min-h-[60px] items-center gap-3 border-t border-line first:border-t-0">
            <SkBlock className="size-10 shrink-0 rounded-[10px]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkLine className={w} />
              <SkLine className="h-2.5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}
