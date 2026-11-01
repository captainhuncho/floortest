"use client";

import { useEffect, useRef } from "react";
import { useSelectionAnnounce } from "./Selection";

/**
 * The floating bar for what is selected (ops kit). It sits after the table and sticks to the bottom of the screen while
 * you scroll, so it never covers the last row; toasts move up above it. Glass, since it floats. The count is read out
 * once per change; the actions are the screen's own (OpsButtons, a small form).
 */
export function BulkBar({ count, onClear, noun = "selected", children }: { count: number; onClear: () => void; noun?: string; children: React.ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  useSelectionAnnounce(count);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--kit-toast-lift", count && bar.current ? `${bar.current.offsetHeight + 12}px` : "0px");
    return () => root.style.setProperty("--kit-toast-lift", "0px");
  }, [count]);
  if (!count) return null;
  return (
    <div ref={bar} role="toolbar" aria-label={`Bulk actions, ${count} ${noun}`} className="kit-bulkbar kit-floating kit-glass">
      <span className="kit-bulk-count" aria-hidden>
        <span key={count} className="kit-bulk-num">
          {count}
        </span>
        <span>{noun}</span>
      </span>
      {children}
      <button type="button" onClick={onClear} aria-label="Clear selection" className="kit-bulk-clear">
        Clear
      </button>
    </div>
  );
}
