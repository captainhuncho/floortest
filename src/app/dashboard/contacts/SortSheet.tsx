"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Kit";
import { Sheet, SHEET_ROW } from "./Sheet";

/**
 * The Contacts list's Sort button and its sheet. Each choice is a plain link to the same list with `?sort=` set and
 * every other part of the address kept (the page builds the links), so the server still picks the order from its fixed
 * list and back works. Choosing one closes the sheet and loads the sorted list.
 */
export function SortSheet({ current, options }: { current: string; options: { key: string; label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const label = options.find((o) => o.key === current)?.label ?? options[0]?.label;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Sort: ${label}`}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-well px-3 text-[14px] font-semibold text-bone hover:border-line-2 sm:text-[13px]"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-4 text-mute" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 7h16M7 12h10M10 17h4" />
        </svg>
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Sort by">
        <ul className="flex flex-col">
          {options.map((o) => (
            <li key={o.key} className="border-b border-line last:border-b-0">
              <Link href={o.href} onClick={() => setOpen(false)} aria-current={o.key === current ? "true" : undefined} className={`${SHEET_ROW} border-b-0 text-bone`}>
                {o.label}
                {o.key === current && <Icon name="tick" className="size-4 text-lime" />}
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
