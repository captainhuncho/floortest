/**
 * How full something is, as a row of cells (rule 15): filled cells for what's used, striped cells for free room.
 * Any use at all fills at least one cell, and only a full limit fills the last. Decorative: say the numbers in text.
 */
export function CapacityStrip({ used, limit, cells = 20, small = false }: { used: number; limit: number; cells?: number; small?: boolean }) {
  const share = limit > 0 ? used / limit : 1;
  const filled = used <= 0 ? 0 : used >= limit ? cells : Math.min(cells - 1, Math.max(1, Math.round(share * cells)));
  return (
    <div aria-hidden className={`grid ${small ? "gap-0.5" : "gap-[3px]"}`} style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}>
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={`${small ? "h-2.5" : "h-4"} rounded-[2px] border border-line ${i < filled ? "bg-bone" : "hatch"}`} />
      ))}
    </div>
  );
}
