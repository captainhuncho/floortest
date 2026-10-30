import { CARD } from "@/components/Kit";

/** One grey line inside a skeleton card, shaped like a row of text. */
function Line({ w }: { w: string }) {
  return <div className={`h-3 rounded-full bg-well ${w}`} />;
}

/**
 * Shown while a dashboard page's data loads. Fades in only after 150ms (.skeleton-in), so a quick navigation shows nothing.
 * Shaped like the redesigned pages: a small label over a 22px title, then cards. The pulse stops for reduced motion.
 */
export default function Loading() {
  return (
    <div className="skeleton-in page-gutter py-4 sm:py-7" role="status" aria-busy="true" aria-label="Loading">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 animate-pulse motion-reduce:animate-none sm:gap-5 xl:max-w-6xl">
        <div className="flex flex-col gap-1.5">
          <Line w="w-24" />
          <div className="h-[22px] w-48 rounded-[8px] bg-well" />
        </div>
        <div className={`${CARD} flex flex-col gap-3 p-3`}>
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-[9px] bg-well" />
            <Line w="w-28" />
          </div>
          <div className="h-24 rounded-[13px] bg-well" />
          <Line w="w-2/3" />
          <Line w="w-1/2" />
        </div>
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className={`${CARD} flex flex-col p-3`}>
              <Line w="w-24" />
              {Array.from({ length: 3 }, (_, j) => (
                <div key={j} className="mt-3 flex min-h-11 items-center gap-2.5 border-t border-line pt-3">
                  <div className="size-[38px] shrink-0 rounded-[10px] bg-well" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Line w="w-3/4" />
                    <Line w="w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
