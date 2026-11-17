/**
 * The Floor while its data loads, in the Floor's own layout: the greeting and its line, the link row, two crates and
 * one row. Fades in only after 150ms (.skeleton-in), so a quick navigation shows nothing. No pulse with reduced motion.
 */
export default function FloorLoading() {
  const crate = "flex h-[212px] flex-col justify-end gap-2 rounded-[20px] border border-line bg-card p-3.5 lg:h-[300px] lg:p-[22px] [@media(max-height:500px)]:h-[120px]";
  return (
    <div className="skeleton-in px-5 py-4 sm:py-7 md:px-8" role="status" aria-busy="true" aria-label="Loading your Floor">
      <div className="mx-auto flex w-full max-w-[920px] animate-pulse flex-col gap-4 motion-reduce:animate-none lg:gap-5">
        <div className="contents lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:items-end lg:gap-6">
          <div className="flex flex-col gap-2.5 max-lg:order-1">
            <div className="h-[30px] w-52 rounded-[9px] bg-well lg:h-[38px] lg:w-72" />
            <div className="h-3.5 w-64 max-w-full rounded-full bg-well" />
          </div>
          <div className="h-12 rounded-[14px] border border-dashed border-line-2 max-lg:order-3" />
        </div>
        <div className="grid grid-cols-2 gap-3 max-lg:order-2 lg:gap-5">
          {[0, 1].map((i) => (
            <div key={i} className={crate}>
              <div className="h-10 w-14 rounded-[9px] bg-well lg:h-14 lg:w-20" />
              <div className="h-3 w-24 max-w-full rounded-full bg-well" />
            </div>
          ))}
        </div>
        <div className="flex min-h-[60px] items-center gap-3 max-lg:order-4">
          <div className="size-10 shrink-0 rounded-[10px] bg-well" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 w-28 rounded-full bg-well" />
            <div className="h-3 w-44 max-w-full rounded-full bg-well" />
          </div>
        </div>
      </div>
    </div>
  );
}
