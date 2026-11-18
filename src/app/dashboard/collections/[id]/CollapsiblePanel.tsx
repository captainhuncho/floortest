"use client";

import { useEffect, useId, useState } from "react";
import { CARD, Icon } from "@/components/Kit";

const key = (id: number) => `ft:collection-panel:${id}`;
const WIDE = "(min-width: 1024px)"; // Tailwind lg: where the panel sits beside the tracks

/**
 * A collection's details that fold to their one-line readout (owner, 16 Nov: "make this collapsible"). Folded on
 * phones and open beside the tracks on desktop until the person chooses; their choice is remembered per collection.
 * Before JavaScript runs the CSS picks the same default, so nothing jumps.
 */
export function CollapsiblePanel({ collectionId, summary, children }: { collectionId: number; summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const bodyId = useId();

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(key(collectionId));
    } catch {}
    // Reading the device and the saved choice can only happen after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(saved === "1" ? true : saved === "0" ? false : window.matchMedia(WIDE).matches);
  }, [collectionId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(key(collectionId), next ? "1" : "0");
    } catch {}
  };

  return (
    <section aria-labelledby="about-h" className={`flex flex-col ${CARD} p-3`}>
      <h2 id="about-h" className="sr-only">
        About this collection
      </h2>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open ?? false}
        aria-controls={bodyId}
        className="-m-1 flex min-h-11 items-center justify-between gap-3 rounded-[10px] p-1 text-left hover:bg-well"
      >
        <span className="min-w-0 font-mono text-[11.5px] text-mute tnum">{summary}</span>
        <Icon
          name="chev"
          className={`size-4 shrink-0 text-mute transition-transform duration-200 motion-reduce:transition-none ${open === null ? "rotate-90 lg:-rotate-90" : open ? "-rotate-90" : "rotate-90"}`}
        />
      </button>
      <div
        id={bodyId}
        inert={open === false}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${open === null ? "grid-rows-[0fr] lg:grid-rows-[1fr]" : open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-3 pt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
