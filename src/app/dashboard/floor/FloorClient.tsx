"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { GHOST_ON_WELL } from "../kitButtons";

/** The receiving link as the mock draws it (owner, 30 Oct): the address in mono, Copy, and Share where the device has a share sheet. */
export function LinkRow({ link }: { link: string }) {
  const toast = useToast();
  const pretty = link.replace(/^https?:\/\//, "");
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.show({ message: "Your link is copied. Paste it anywhere." });
    } catch {
      toast.show({ message: `Couldn't copy. Your link is ${pretty}` });
    }
  }
  async function share() {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: "Send me your music", url: link });
    } catch {
      // Closing the share sheet isn't an error worth saying anything about.
    }
  }
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-line bg-well py-1 pl-3 pr-1">
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-bone">{pretty}</span>
      <button type="button" onClick={copy} aria-label={`Copy your link, ${pretty}`} className={GHOST_ON_WELL}>
        <svg viewBox="0 0 24 24" aria-hidden className="size-[15px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 8.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 8.5 18v-8A1.5 1.5 0 0 1 10 8.5zM15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
        </svg>
        Copy
      </button>
      <button type="button" onClick={share} aria-label="Share your link" className={GHOST_ON_WELL.replace("px-3", "w-10 px-0")}>
        <svg viewBox="0 0 24 24" aria-hidden className="size-[15px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15V4M8 8l4-4 4 4M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" />
        </svg>
      </button>
    </div>
  );
}

type Day = { weekday: string; count: number; kept: number; listened: number; today: boolean };
const VIEWS = [
  ["received", "Received"],
  ["kept", "Kept"],
  ["listened", "Listened"],
] as const;

/**
 * The last seven days, per local day, with a Received / Kept / Listened switch (owner, 30 Oct mock). Received shows the
 * kept part in lime on each grey bar; Kept and Listened show their own count in lime. The totals are said in text above.
 */
export function WeekChart({ days }: { days: Day[] }) {
  const [view, setView] = useState<(typeof VIEWS)[number][0]>("received");
  const value = (d: Day) => (view === "received" ? d.count : view === "kept" ? d.kept : d.listened);
  const top = Math.max(1, ...days.map((d) => Math.max(value(d), view === "received" ? d.kept : 0)));
  const total = days.reduce((n, d) => n + value(d), 0);
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Show" className="inline-flex w-fit gap-1 rounded-xl border border-line bg-well p-[3px]">
        {VIEWS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={`tap rounded-[9px] px-2.5 py-1.5 text-[12px] ${view === k ? "bg-lime/15 font-semibold text-lime" : "text-mute hover:text-bone"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {total} {view} in the last 7 days.
      </p>
      <div aria-hidden className="flex flex-col gap-1.5">
        <div className="relative grid h-24 grid-cols-7 items-end gap-2 border-b border-dashed border-line-2">
          <span className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <span className="pointer-events-none absolute -top-2 right-0 text-[10px] text-faint tnum">{top}</span>
          {days.map((d, i) => {
            const v = value(d);
            const lime = view === "received" ? Math.min(d.kept, v) : v;
            const grey = view === "received" ? Math.max(0, v - lime) : 0;
            return (
              <div key={i} className="flex h-full flex-col justify-end gap-0.5">
                {grey > 0 && <span className="block rounded-[5px] bg-line-2" style={{ height: `${(grey / top) * 100}%` }} />}
                {lime > 0 && <span className="block rounded-[5px] bg-lime" style={{ height: `${(lime / top) * 100}%` }} />}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-[11px] text-faint">
          {days.map((d, i) => (
            <span key={i} className={d.today ? "font-semibold text-bone" : ""}>
              {d.weekday.slice(0, 1)}
            </span>
          ))}
        </div>
      </div>
      <ul aria-hidden className="flex gap-3 text-[11px] text-mute">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2.5px] bg-lime" />
          {view === "listened" ? "Listened" : "Kept"}
        </li>
        {view === "received" && (
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2.5px] bg-line-2" />
            Received
          </li>
        )}
      </ul>
    </div>
  );
}
