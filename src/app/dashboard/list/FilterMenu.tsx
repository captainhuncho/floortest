"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type Option = { label: string; href: string; active: boolean; count?: number };

/** A compact dropdown filter, styled after the reference's "Type ⌄  Genre ⌄" bar. */
export function FilterMenu({ label, options }: { label: string; options: Option[] }) {
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
        className={`flex items-center gap-1.5 rounded-md border border-line bg-ink-3 px-3 py-1.5 text-[11px] font-medium transition hover:text-bone md:px-2.5 md:py-1.5 md:text-[11px] ${filtered ? "text-bone" : "text-mute"}`}
      >
        {label}
        {filtered && <span className="max-w-32 truncate text-lime">: {current.label}</span>}
        <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 max-h-80 min-w-52 overflow-y-auto rounded-lg border border-line bg-ink-2 p-1 shadow-2xl shadow-black/60">
          {options.map((o) => (
            <Link
              key={o.href}
              role="menuitemradio"
              aria-checked={o.active}
              href={o.href}
              onClick={() => setOpen(false)}
              className={`flex items-center justify-between gap-4 rounded-md px-3 py-2 text-sm hover:bg-ink-3 ${o.active ? "text-bone" : "text-mute"}`}
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
