"use client";

import { useState } from "react";

/**
 * Year / Month switch for the plans page. Both prices are already on the page, so switching is instant: the pill
 * slides across and the cards cross-fade (see .period-* in globals.css). The URL follows, so a shared link opens
 * on the same view.
 */
export function BillingSwitch({ initial, target }: { initial: "year" | "month"; target: string }) {
  const [period, setPeriod] = useState(initial);
  const pick = (p: "year" | "month") => {
    if (p === period) return;
    setPeriod(p);
    document.getElementById(target)?.setAttribute("data-period", p);
    try {
      const url = new URL(window.location.href);
      if (p === "year") url.searchParams.set("period", "year");
      else url.searchParams.delete("period");
      window.history.replaceState(window.history.state, "", url);
    } catch {}
  };
  return (
    <div role="radiogroup" aria-label="Billing period" className="relative flex gap-1 rounded-full border border-line bg-ink-2 p-1">
      <span
        aria-hidden
        className="absolute left-1 top-1 h-[34px] w-[88px] rounded-full bg-ink-3 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: period === "month" ? "translateX(92px)" : "translateX(0)" }}
      />
      {(["year", "month"] as const).map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={period === p}
          onClick={() => pick(p)}
          className={`relative z-10 grid h-[34px] w-[88px] place-items-center rounded-full text-[13px] font-semibold transition-colors duration-300 ${period === p ? "text-lime" : "text-mute hover:text-bone"}`}
        >
          {p === "year" ? "Year" : "Month"}
        </button>
      ))}
    </div>
  );
}
