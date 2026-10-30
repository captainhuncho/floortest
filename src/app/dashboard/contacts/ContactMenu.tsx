"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** A contact row's ··· menu: email them, or open their page (notes, replies, block). Escape or a click outside closes it. */
export function ContactMenu({ id, name, email }: { id: number; name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        setOpen(false);
        button.current?.focus();
      } else if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item = "flex min-h-11 items-center rounded-[10px] px-3 text-[13px] text-bone hover:bg-well focus-visible:bg-well";
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`More for ${name}`}
        className="grid size-11 place-items-center rounded-[11px] text-mute transition-colors duration-150 hover:bg-well hover:text-bone motion-reduce:transition-none"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <div role="menu" aria-label={name} className="absolute right-0 top-full z-30 mt-1 w-64 rounded-[13px] border border-line bg-card p-1 shadow-pop">
          <a role="menuitem" href={`mailto:${email}`} onClick={() => setOpen(false)} className={`${item} flex-col items-start justify-center gap-0.5 py-1.5`}>
            <span>Email</span>
            <span className="max-w-full truncate text-[11.5px] text-mute">{email}</span>
          </a>
          <Link role="menuitem" href={`/dashboard/contacts/${id}`} onClick={() => setOpen(false)} className={item}>
            Open contact
          </Link>
        </div>
      )}
    </div>
  );
}
