"use client";

import { stored, useDeviceState } from "@/components/useBrowserValue";

const KEY = "ft:review-details";

/**
 * The review panel's "Details": file info, dates, download/move/delete and the sender's record, folded away so the
 * decision (play, Keep, Not for me) has the screen. A native <details>, so it works with keyboards, screen readers and
 * find-in-page; open or closed is remembered on this device.
 */
export function PanelDetails({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useDeviceState(() => stored(KEY) === "1", false);
  return (
    <details
      open={open}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        setOpen(now);
        try {
          localStorage.setItem(KEY, now ? "1" : "0");
        } catch {}
      }}
      className="group mt-6 rounded-lg border border-line"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{summary}</span>
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md border border-line text-base leading-none">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}
