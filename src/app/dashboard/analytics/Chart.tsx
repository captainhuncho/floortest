export type ChartBar = { key: string; label: string; in: number; kept: number; third: number };

/** With more bars than this (30 days, a long lifetime) the counts over and under each bar are left out so nothing collides. */
const MAX_COUNTED_BARS = 14;

/**
 * The period's bars (days, weeks or months), as drawn in option 41: each bar is the tracks that came in, with the kept
 * part in lime, the count above it and the kept count under its label. Nothing here needs a tap or a hover; the same
 * numbers, with played out or downloaded too, are in a table for screen readers.
 */
export function AnalyticsChart({ bars, thirdLabel, span, unit }: { bars: ChartBar[]; thirdLabel: string; span: string; unit: "day" | "week" | "month" }) {
  const top = Math.max(1, ...bars.map((b) => b.in));
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
          const kept = Math.min(b.kept, b.in);
          return (
            <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              {counted && <span className={`text-[12px] tnum ${b.in ? "text-bone" : "text-faint"}`}>{b.in}</span>}
              <div className="flex h-24 w-full max-w-12 flex-col justify-end gap-0.5">
                {b.in === 0 ? (
                  <span className="block h-1 rounded-[4px] bg-line" />
                ) : (
                  <>
                    {b.in - kept > 0 && <span className="block rounded-[4px] bg-line-2" style={{ height: `${((b.in - kept) / top) * 100}%` }} />}
                    {kept > 0 && <span className="block rounded-[4px] bg-lime" style={{ height: `${(kept / top) * 100}%` }} />}
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
