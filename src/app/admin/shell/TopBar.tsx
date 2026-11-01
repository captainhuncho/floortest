"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Icon } from "../AdminNav";
import { OPEN_PALETTE_EVENT } from "../kit/Palette";
import type { ShellArea, ShellPage } from "./model";

// The time in the bar: read in the browser (the server's clock and zone aren't the viewer's), checked every 15 s.
const everyFewSeconds = (tick: () => void) => {
  const t = setInterval(tick, 15_000);
  return () => clearInterval(t);
};
const clock = () => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());
const never = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * The top bar (admin redesign B): where you are (Ops › area › page), ⌘K and the time. It floats over the page, so it
 * is the one glass layer of the shell (solid with reduced transparency). Today's admin has no bell, so neither does
 * this. On phones it keeps only the page's name; the bottom bar has the rest.
 */
export function TopBar({ area, page }: { area: ShellArea | undefined; page: ShellPage | undefined }) {
  const time = useSyncExternalStore(everyFewSeconds, clock, () => "");
  const mac = useSyncExternalStore(never, isMac, () => true);
  const showArea = area && page && area.title !== page.label;
  return (
    <header className="sticky top-0 z-20 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-3 md:pt-3">
      <div className="kit-glass flex min-h-12 items-center gap-3 rounded-[16px] pl-3 pr-2 md:pl-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
        <img draggable={false} src="/brand/crest-ops.svg" alt="" aria-hidden className="size-7 shrink-0 md:hidden" />
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-2 text-[13px] text-faint">
            <li className={page ? "hidden shrink-0 sm:block" : "shrink-0 font-semibold text-bone"}>Ops</li>
            {showArea && (
              <li className="hidden shrink-0 items-center gap-2 sm:flex">
                <span aria-hidden>›</span>
                <Link href={area.href} className="rounded-[6px] hover:text-bone">
                  {area.title}
                </Link>
              </li>
            )}
            {page && (
              <li className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="hidden sm:inline">
                  ›
                </span>
                <span aria-current="page" className="truncate text-[14px] font-semibold text-bone sm:text-[13px]">
                  {page.label}
                </span>
              </li>
            )}
          </ol>
        </nav>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
          aria-keyshortcuts="Meta+K Control+K"
          className="ops-press hidden min-h-11 items-center gap-2.5 rounded-[11px] bg-ink-3/70 px-3 text-[13px] text-mute hover:text-bone md:flex lg:w-[300px]"
        >
          <Icon name="search" className="size-4 shrink-0" />
          <span className="flex-1 truncate text-left">
            <span className="hidden lg:inline">Search people, pages and actions</span>
            <span className="lg:hidden">Search</span>
          </span>
          <kbd className="kit-kbd shrink-0">{mac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        {time && (
          <span className="hidden shrink-0 items-center gap-2 pr-2 text-[13px] text-mute tnum md:flex">
            <span aria-hidden className="admin-live relative size-1.5 rounded-full bg-lime" />
            <time>{time}</time>
          </span>
        )}
      </div>
    </header>
  );
}
