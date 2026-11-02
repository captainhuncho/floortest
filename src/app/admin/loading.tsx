import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/**
 * Any ops page while it loads. It renders inside the layout's <main>, so the navigation (today's sidebar and tabs, or the
 * new shell's rail, panel and top bar) stays put and only the page area changes. Shaped like most ops pages: the title
 * and its line, then a list card of rows (Users, Moderation, Inbox, the queues).
 */
export default function Loading() {
  return (
    <SkeletonFrame className="flex flex-col gap-6">
      <div className="flex flex-col">
        <SkBlock tone="ops" className="h-9 w-56 max-w-full rounded-[10px]" />
        <SkLine tone="ops" className="mt-2.5 w-96 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-[14px] border border-line bg-ink-2">
        {["w-2/5", "w-1/3", "w-1/2", "w-2/5", "w-1/4", "w-1/3"].map((w, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <div className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
              <SkLine tone="ops" className={w} />
              <SkLine tone="ops" className="h-2.5 w-3/5" />
            </div>
            <SkLine tone="ops" className="w-12 shrink-0" />
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}
