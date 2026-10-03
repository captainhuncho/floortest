"use client";

import { useState } from "react";

/** Chart marks are white, as in the Figma "desktop-floor-dashboard". */
const MARK = "var(--color-bone)";

type Day = { day: string; count: number; today: boolean };

/** Tracks received per day. Single series, so no legend: the heading names it. */
export function DailyColumns({ data }: { data: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const H = 120;

  return (
    <figure className="relative">
      <div className="relative" style={{ height: H + 24 }} onMouseLeave={() => setHover(null)}>
        {/* One recessive gridline at the peak value carries the scale. */}
        <div className="absolute inset-x-0 border-t border-line" style={{ top: 0 }} aria-hidden />
        <span className="absolute -top-2.5 right-0 bg-ink-2 pl-1 text-xs text-mute tnum" aria-hidden>
          {max}
        </span>
        <div className="absolute inset-x-0 bottom-6 border-t border-line" aria-hidden />
        <div className="absolute inset-x-0 top-0 flex items-end gap-[2px]" style={{ height: H }} aria-hidden>
          {data.map((d, i) => {
            const h = d.count ? Math.max(4, (d.count / max) * H) : 0;
            return (
              <div key={d.day} className="relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)}>
                <div
                  className="w-full max-w-6 rounded-t transition-opacity"
                  style={{ height: h, background: MARK, opacity: hover === null || hover === i ? 1 : 0.45 }}
                />
                {/* The scale line already carries the peak; label only today. */}
                {d.today && d.count > 0 && d.count !== max && hover === null && (
                  <span className="absolute text-xs text-bone tnum" style={{ bottom: h + 4 }}>
                    {d.count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-xs text-mute" aria-hidden>
          <span>{data[0]?.day}</span>
          <span>Today</span>
        </div>
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-ink px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%`, top: -8 }}
          >
            <span className="text-mute">{data[hover].today ? "Today" : data[hover].day}</span>{" "}
            <span className="font-semibold tnum">
              {data[hover].count} track{data[hover].count === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>
      <div className="sr-only"><table>
        <caption>Tracks received per day, last 14 days</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </figure>
  );
}

/** Genre share as horizontal bars, value at each bar's tip. */
export function GenreBars({ data }: { data: { genre: string; n: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.n, 0);
  const max = Math.max(1, ...data.map((d) => d.n));
  if (!total) return <p className="text-xs text-faint">No tracks in the last 30 days.</p>;
  return (
    <figure>
      <ul className="space-y-3" aria-hidden onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <li key={d.genre} className="flex items-center gap-3" onMouseEnter={() => setHover(i)}>
            <span className="w-[100px] shrink-0 truncate text-xs text-mute">{d.genre}</span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-ink-3">
              <span className="block h-full bg-white transition-opacity" style={{ width: `${(d.n / max) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.45 }} />
            </span>
            <span className="w-6 shrink-0 text-right text-[11px] text-faint tnum">{hover === i ? `${Math.round((d.n / total) * 100)}%` : d.n}</span>
          </li>
        ))}
      </ul>
      <div className="sr-only"><table>
        <caption>Tracks received by genre, last 30 days</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.genre}>
              <th scope="row">{d.genre}</th>
              <td>
                {d.n} ({Math.round((d.n / total) * 100)}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </figure>
  );
}
