"use client";

import { useState } from "react";

export type ChartBar = { key: string; label: string; in: number; kept: number; third: number };

/**
 * The period's bars (days, weeks or months) with a Tracks in / Kept / Played out (or Downloaded) switch. "Tracks in" shows
 * the kept part in lime on each grey bar, like the Floor's old week chart. The totals are said in text above the chart.
 */
export function AnalyticsChart({ bars, thirdLabel, span }: { bars: ChartBar[]; thirdLabel: string; span: string }) {
  const views = [
    ["in", "Tracks in"],
    ["kept", "Kept"],
    ["third", thirdLabel],
  ] as const;
  const [view, setView] = useState<(typeof views)[number][0]>("in");
  const value = (b: ChartBar) => b[view];
  const top = Math.max(1, ...bars.map(value));
  const total = bars.reduce((n, b) => n + value(b), 0);
  // Label every bar when they fit; with many (30 days, a long lifetime) only every few, so the words never collide.
  const every = Math.max(1, Math.ceil(bars.length / 8));
  const viewLabel = views.find(([k]) => k === view)![1];
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Show" className="inline-flex w-fit gap-1 rounded-xl border border-line bg-well p-[3px]">
        {views.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={`tap min-h-11 rounded-[9px] px-3 text-[12px] ${view === k ? "bg-lime/15 font-semibold text-lime" : "text-mute hover:text-bone"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {total} {viewLabel.toLowerCase()} {span}.
      </p>
      {/* The same numbers as the bars, for screen readers: every bar, every count, no hover needed. */}
      <table className="sr-only">
        <caption>{viewLabel} {span}</caption>
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
      <div aria-hidden className="flex flex-col gap-1.5">
        <div className="relative flex h-28 items-end gap-[clamp(1px,0.6vw,8px)] border-b border-dashed border-line-2">
          <span className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <span className="pointer-events-none absolute -top-2 right-0 text-[10px] text-faint tnum">{top}</span>
          {bars.map((b) => {
            const v = value(b);
            const lime = view === "in" ? Math.min(b.kept, v) : v;
            const grey = view === "in" ? Math.max(0, v - lime) : 0;
            return (
              <div key={b.key} className="flex h-full min-w-0 max-w-12 flex-1 flex-col justify-end gap-0.5">
                {grey > 0 && <span className="block rounded-[4px] bg-line-2" style={{ height: `${(grey / top) * 100}%` }} />}
                {lime > 0 && <span className="block rounded-[4px] bg-lime" style={{ height: `${(lime / top) * 100}%` }} />}
              </div>
            );
          })}
        </div>
        <div className="flex gap-[clamp(1px,0.6vw,8px)] text-[11px] text-faint">
          {bars.map((b, i) => (
            <span key={b.key} className="min-w-0 max-w-12 flex-1 overflow-visible whitespace-nowrap text-center">
              {i % every === 0 ? b.label : ""}
            </span>
          ))}
        </div>
      </div>
      <ul aria-hidden className="flex gap-3 text-[11px] text-mute">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2.5px] bg-lime" />
          {view === "in" ? "Kept" : viewLabel}
        </li>
        {view === "in" && (
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2.5px] bg-line-2" />
            Tracks in
          </li>
        )}
      </ul>
    </div>
  );
}
