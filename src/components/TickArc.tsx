/**
 * A half circle of ticks (ops Overview, pin 119), shared by the ops Health gauge and the desk's fullness gauge.
 * `colours` gives each tick its colour, left to right; ticks listed in `lit` get `litClassName` (the ops arrival
 * animation). The middle holds whatever the caller puts in `children`. Decorative: the caller names it with `label`.
 */
export function TickArc({ colours, lit = 0, litClassName = "", label, children }: { colours: string[]; lit?: number; litClassName?: string; label: string; children: React.ReactNode }) {
  const ticks = colours.length;
  return (
    <div className="relative mx-auto mt-2 h-[132px] w-[240px]" role="img" aria-label={label}>
      <svg viewBox="0 0 240 132" className="absolute inset-0" aria-hidden>
        {colours.map((colour, i) => {
          const a = Math.PI - (i / (ticks - 1)) * Math.PI;
          return (
            <line
              key={i}
              x1={120 + Math.cos(a) * 82}
              y1={122 - Math.sin(a) * 82}
              x2={120 + Math.cos(a) * 112}
              y2={122 - Math.sin(a) * 112}
              stroke={colour}
              strokeWidth="9"
              strokeLinecap="round"
              className={i < lit ? litClassName : ""}
              style={{ "--i": i } as React.CSSProperties}
            />
          );
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center">{children}</div>
    </div>
  );
}
