"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Kit";

export type Option = { label: string; href: string; active: boolean; count?: number };

/**
 * A compact dropdown filter ("Type ⌄  Genre ⌄"). `icon` puts a folder in front and makes it field-sized, for the
 * Review Queue's collection filter beside the search.
 */
export function FilterMenu({ label, options, icon = false }: { label: string; options: Option[]; icon?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.active);
  const filtered = current && current !== options[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1.5 border border-line bg-well font-medium transition hover:text-bone ${
          icon ? "min-h-11 rounded-xl px-3 text-[13px]" : "min-h-9 rounded-[10px] px-2.5 text-[11.5px]"
        } ${filtered ? "text-bone" : "text-mute"}`}
      >
        {icon && <Icon name="folder" className="size-4" />}
        {label}
        {filtered && <span className="max-w-32 truncate text-lime">: {current.label}</span>}
        <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 max-h-80 min-w-52 overflow-y-auto rounded-[13px] border border-line bg-card p-1 shadow-pop">
          {options.map((o) => (
            <Link
              key={o.href}
              role="menuitemradio"
              aria-checked={o.active}
              href={o.href}
              onClick={() => setOpen(false)}
              className={`flex min-h-11 items-center justify-between gap-4 rounded-[10px] px-3 py-2 text-[13px] hover:bg-well ${o.active ? "text-bone" : "text-mute"}`}
            >
              <span className="truncate">
                {o.active && <span aria-hidden className="text-lime">✓ </span>}
                {o.label}
              </span>
              {o.count !== undefined && <span className="tnum text-xs text-mute">{o.count}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
