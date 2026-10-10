"use client";

/**
 * The one line that answers "what happened?". Keyed on the status, so when the page's live refresh brings a new
 * one (the listen, most often) the headline settles in once, from just below, and then stays put. Reduced motion
 * keeps only the fade.
 */
export function StatusHeadline({ status, title, detail, strong }: { status: string; title: string; detail: string; strong: boolean }) {
  return (
    <div key={status} role="status" aria-live="polite" className="flex flex-col gap-1.5 starting:opacity-0 motion-safe:starting:translate-y-1 transition-[opacity,translate] duration-300 ease-[var(--ease-out)]">
      <h1 className={`text-[28px] font-bold leading-[1.15] tracking-[-0.5px] ${strong ? "text-bone" : "text-mute"}`}>{title}</h1>
      <p className="text-[13px] text-mute">{detail}</p>
    </div>
  );
}
