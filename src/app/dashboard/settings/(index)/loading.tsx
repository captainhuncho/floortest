import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/** One group: its small label over a card of rows, each an icon, a title and a line. */
function GroupSk({ rows }: { rows: number }) {
  return (
    <div>
      <SkLine className="mx-1 mb-2.5 mt-2.5 h-2.5 w-20" />
      <div className="flex flex-col rounded-2xl bg-card px-3.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex min-h-14 items-center gap-3 border-b border-line last:border-b-0">
            <SkBlock className="size-5 shrink-0 rounded-md" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkLine className="w-28" />
              <SkLine className="h-2.5 w-44 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Settings while it loads, in the page's own layout: the header's three parts, the You row, then the groups in one
 * column, or two from 1180px.
 */
export default function Loading() {
  return (
    <SkeletonFrame className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SkBlock className="size-11 rounded-full" />
        <div className="flex h-9 flex-1 items-center justify-center">
          <SkBlock className="h-7 w-32 rounded-[8px]" />
        </div>
        <SkBlock className="size-11 rounded-full" />
      </div>
      <div className="flex flex-wrap items-center gap-3.5 rounded-[20px] border border-line bg-card p-4 min-[1180px]:px-6 min-[1180px]:py-[22px]">
        <SkBlock className="size-16 shrink-0 rounded-full min-[1180px]:size-[88px]" />
        <div className="flex flex-1 flex-col gap-2">
          <SkLine className="h-4 w-36" />
          <SkLine className="w-44 max-w-full" />
          <SkLine className="h-2.5 w-40 max-w-full" />
        </div>
        <SkBlock className="h-11 w-full rounded-xl min-[1180px]:w-64" />
      </div>
      <div className="grid grid-cols-1 items-start gap-3 min-[1180px]:grid-cols-2 min-[1180px]:gap-6">
        <div className="flex flex-col gap-3">
          <GroupSk rows={3} />
          <div className="hidden min-[1180px]:block">
            <GroupSk rows={1} />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <GroupSk rows={2} />
          <GroupSk rows={4} />
          <GroupSk rows={5} />
        </div>
      </div>
    </SkeletonFrame>
  );
}
