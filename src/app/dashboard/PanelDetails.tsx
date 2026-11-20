"use client";

import { stored, useDeviceState } from "@/components/useBrowserValue";
import { CARD, Icon } from "@/components/Kit";

const KEY = "ft:review-team";

/**
 * A team desk's Review together (comments, votes, shortlist), folded under the review card so the decision (play, Keep,
 * Not for me) has the screen. The track's facts and the sender's record moved to Info and Move, Report and Delete to
 * More (review card option 1; owner, 20 Nov). A native <details>, so it works with keyboards, screen readers and
 * find-in-page; open or closed is remembered on this device.
 */
export function PanelDetails({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useDeviceState(() => stored(KEY) === "1", false);
  return (
    <details
      data-panel-team
      open={open}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        setOpen(now);
        try {
          localStorage.setItem(KEY, now ? "1" : "0");
        } catch {}
      }}
      className={`group ${CARD} p-3.5 sm:p-4`}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[11px] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-well text-mute">
          <Icon name="down" className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
