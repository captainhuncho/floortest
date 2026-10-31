"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/Kit";
import { WELL } from "./ui";

/**
 * A list that folds (owner, 31 Oct: "tap to expand, tap to collapse… to make the page feel smaller"). Closed, it is one
 * row: the title, how many, and the one item that matters most (this device, the newest email). The whole row is the
 * button. Short lists (up to `openUpTo` items) start open; longer ones start closed. Nothing is remembered: each visit
 * starts the same way.
 */
export function Fold({ title, count, lead, openUpTo = 2, children }: { title: string; count: number; lead?: React.ReactNode; openUpTo?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(count <= openUpTo);
  const body = useId();
  return (
    <div className={`${WELL} overflow-hidden`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={body}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lime"
      >
        <Icon name="chev" className={`size-4 text-mute transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-bone">
            {title} <span className="font-normal text-mute tnum">· {count}</span>
          </span>
          {lead && !open && <span className="block truncate text-[11.5px] text-mute">{lead}</span>}
        </span>
        <span className="shrink-0 text-[12px] text-mute">{open ? "Hide" : "Show all"}</span>
      </button>
      <div id={body} hidden={!open} className="border-t border-line">
        {children}
      </div>
    </div>
  );
}
