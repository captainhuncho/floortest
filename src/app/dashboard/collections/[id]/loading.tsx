import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/**
 * A folder's page while it loads (FolderPage: a callout's and a project's alike): back and tools, the cover (centred on
 * phones, on the left from lg), the name and its facts, the wide button, then numbered tracks.
 */
export default function Loading() {
  return (
    <SkeletonFrame outer="page-gutter py-3 sm:py-6" className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-3 sm:gap-4">
      <div className="flex items-center justify-between">
        <SkBlock className="size-9 rounded-full" />
        <SkBlock className="size-9 rounded-full" />
      </div>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start lg:gap-8 min-[1180px]:grid-cols-[260px_minmax(0,1fr)]">
        <SkBlock className="mx-auto size-40 rounded-[16px] lg:mx-0 lg:aspect-square lg:size-auto lg:w-full" />
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <div className="flex flex-col gap-2">
            <SkBlock className="h-[26px] w-48 rounded-[8px]" />
            <SkLine className="w-40" />
          </div>
          <SkBlock className="h-12 rounded-[14px]" />
          <div className="flex flex-col">
            {["w-1/3", "w-1/4", "w-2/5", "w-1/5"].map((w) => (
              <div key={w} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                <SkBlock className="size-11 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <SkLine className={w} />
                  <SkLine className="h-2.5 w-2/5" />
                </div>
                <SkLine className="w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonFrame>
  );
}
