import { CARD } from "@/components/Kit";
import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";
import { SENT_MAIN } from "../parts";

/** The sender's history while it loads: the header lines, three chips, a group label and a card of rows. */
export default function Loading() {
  return (
    <main className={SENT_MAIN}>
      <SkeletonFrame className="flex flex-col">
        <div className="flex flex-col gap-2.5 px-0.5 pt-3">
          <SkLine className="w-40" />
          <SkBlock className="h-7 w-64 max-w-full rounded-[8px]" />
          <SkLine className="w-48" />
        </div>
        <div className="mt-3 flex gap-1.5">
          <SkBlock className="h-11 w-14 rounded-full" />
          <SkBlock className="h-11 w-24 rounded-full" />
          <SkBlock className="h-11 w-24 rounded-full" />
        </div>
        <SkLine className="mx-0.5 mt-4 w-20" />
        <div className={`${CARD} mt-2 px-3`}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex min-h-[60px] items-center gap-3 border-t border-line py-2 first:border-t-0">
              <SkBlock className="size-10 shrink-0 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2">
                <SkLine className="w-40 max-w-full" />
                <SkLine className="w-28 max-w-full" />
              </div>
              <SkLine className="w-16" />
            </div>
          ))}
        </div>
      </SkeletonFrame>
    </main>
  );
}
