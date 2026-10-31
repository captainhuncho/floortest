"use client";

import { useState } from "react";
import { Segmented } from "@/components/Segmented";

/**
 * Monthly / Yearly switch for the plans page (the shared Segmented control). Both prices are already on the page, so
 * switching is instant: the cards cross-fade (see .period-* in globals.css). The URL follows, so a shared link opens
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
    <Segmented
      label="Billing period"
      value={period}
      onChange={pick}
      items={[
        { key: "month", label: "Monthly" },
        { key: "year", label: "Yearly" },
      ]}
    />
  );
}
