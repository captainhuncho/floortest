"use client";

import type { ReactNode } from "react";

/**
 * The top of the receipt, centred like a payment receipt: the status icon, the one line that answers "what happened?"
 * and its detail. Keyed on the status, so when the page's live refresh brings a new one (the listen, most often) it
 * settles in once, from just below, and then stays put. Reduced motion keeps only the fade.
 */
export function StatusHeadline({ status, title, detail, strong, icon }: { status: string; title: string; detail: string; strong: boolean; icon: ReactNode }) {
  return (
    <div
      key={status}
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-2 text-center starting:opacity-0 motion-safe:starting:translate-y-1 transition-[opacity,translate] duration-300 ease-[var(--ease-out)]"
    >
      {icon}
      <h1 className={`mt-1 text-balance text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] ${strong ? "text-bone" : "text-mute"}`}>{title}</h1>
      <p className="max-w-[34ch] text-pretty text-[13px] leading-[1.5] text-mute">{detail}</p>
    </div>
  );
}
