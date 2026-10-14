"use client";

import { createContext, use, useState, type ReactNode } from "react";

/** The steps the receipt showed when this visit began. Anything reached later arrived while the sender was here. */
const Baseline = createContext<ReadonlySet<string> | null>(null);

/**
 * Wraps the receipt's history. It remembers which steps had happened on first render; the page's live refresh
 * (LivePulse) re-renders the server page, this keeps its state, and so a step missing from the first render is new.
 */
export function ReachedSteps({ reached, children }: { reached: string[]; children: ReactNode }) {
  const [baseline] = useState<ReadonlySet<string>>(() => new Set(reached));
  return <Baseline value={baseline}>{children}</Baseline>;
}

/**
 * A history dot. When its step arrives during this visit (Listened, most often), a lime ring leaves it once:
 * scale 1 to 2.4, fading from half to nothing, 700ms ease-out. Never on first load; decided when the dot first
 * appears, so later refreshes don't replay it. Reduced motion: no ring, the dot simply appears in its colour.
 */
export function SignalDot({ step, className }: { step: string; className: string }) {
  const baseline = use(Baseline);
  const [arrived] = useState(() => !!baseline && !baseline.has(step));
  return (
    <span aria-hidden className={`relative transition-[background-color] duration-300 ease-[var(--ease-out)] ${className}`}>
      {arrived && (
        <span className="pointer-events-none absolute inset-0 rounded-full border border-lime opacity-0 [scale:2.4] transition-[scale,opacity] duration-700 ease-[var(--ease-out)] starting:opacity-50 starting:[scale:1] motion-reduce:hidden" />
      )}
    </span>
  );
}
