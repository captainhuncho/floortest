export type ChartBar = { key: string; label: string; in: number; kept: number; third: number };

/** With more bars than this (30 days, a long lifetime) the counts over and under each bar are left out so nothing collides. */
const MAX_COUNTED_BARS = 14;

/**
 * The period's bars (days, weeks or months), as drawn in option 41: each bucket shows the tracks that came in and, beside
 * them in lime, the tracks kept that day (a keep counts on the day it was decided, so it can fall on a day with no
 * arrivals), the count above and the kept count under its label. Nothing here needs a tap or a hover; the same
 * numbers, with played out or downloaded too, are in a table for screen readers.
 */
/** Heights as a share of the tallest bar, so a keep on a day with no arrivals still shows (option 41 fix). */
export function barHeights(b: Pick<ChartBar, "in" | "kept">, top: number): { in: number; kept: number } {
  const scale = Math.max(1, top);
  return { in: (b.in / scale) * 100, kept: (b.kept / scale) * 100 };
}

export function AnalyticsChart({ bars, thirdLabel, span, unit }: { bars: ChartBar[]; thirdLabel: string; span: string; unit: "day" | "week" | "month" }) {
  const top = Math.max(1, ...bars.map((b) => Math.max(b.in, b.kept)));
  const counted = bars.length <= MAX_COUNTED_BARS;
  // Label every bar when they fit; with many only every few, so the words never collide.
  const every = Math.max(1, Math.ceil(bars.length / 8));
  const gap = "gap-[clamp(1px,0.6vw,8px)]";
  return (
    <div className="flex flex-col gap-2">
      {/* The same numbers as the bars, for screen readers: every bar, every count. */}
      <table className="sr-only">
        <caption>Tracks in and kept {span}</caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Tracks in</th>
            <th scope="col">Kept</th>
            <th scope="col">{thirdLabel}</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.label}</th>
              <td>{b.in}</td>
              <td>{b.kept}</td>
              <td>{b.third}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div aria-hidden className={`flex items-end ${gap}`}>
        {bars.map((b, i) => {
          const h = barHeights(b, top);
          return (
            <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              {counted && <span className={`text-[12px] tnum ${b.in ? "text-bone" : "text-faint"}`}>{b.in}</span>}
              <div className="flex h-24 w-full max-w-12 items-end gap-0.5">
                {b.in === 0 && b.kept === 0 ? (
                  <span className="block h-1 w-full rounded-[4px] bg-line" />
                ) : (
                  <>
                    <span className={`block min-w-0 flex-1 rounded-[4px] ${b.in ? "bg-line-2" : "h-1 bg-line"}`} style={b.in ? { height: `${h.in}%` } : undefined} />
                    {b.kept > 0 && <span className="block min-w-0 flex-1 rounded-[4px] bg-lime" style={{ height: `${h.kept}%` }} />}
                  </>
                )}
              </div>
              <span className="h-4 max-w-full overflow-visible whitespace-nowrap text-[11px] text-faint">{i % every === 0 ? b.label : ""}</span>
              {counted && <span className={`text-[11px] tnum ${b.kept ? "font-semibold text-lime" : "text-faint"}`}>{b.kept || "·"}</span>}
            </div>
          );
        })}
      </div>
      <p aria-hidden className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-mute">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2.5px] bg-line-2" />
          tracks in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2.5px] bg-lime" />
          kept that {unit}
        </span>
      </p>
    </div>
  );
}
