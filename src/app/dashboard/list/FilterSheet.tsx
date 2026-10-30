"use client";

import Link from "next/link";
import { useRef } from "react";
import { Icon } from "@/components/Kit";
import type { Option } from "./FilterMenu";

/**
 * Phones: the List view's filters behind one button (owner, 30 Oct: seven filter buttons pushed the first track a third
 * of the way down the screen). The sheet stays open while you pick, so several filters take one trip; each pick
 * reloads the list behind it. A native dialog: Escape and the backdrop close it, focus stays inside.
 */
export function FilterSheet({
  menus,
  active,
  clearHref,
  results,
  className = "",
}: {
  menus: { label: string; options: Option[] }[];
  /** How many filters are on (shown on the button). */
  active: number;
  clearHref: string;
  /** Tracks the current filters show, for the sheet's close button. */
  results: number;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
        className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold ${active ? "border-lime/40 bg-lime/12 text-lime" : "border-line bg-well text-bone"} ${className}`}
      >
        <Icon name="filter" className="size-4" />
        Filter
        {active > 0 && (
          <span className="grid min-w-5 place-items-center rounded-md bg-lime px-1 text-[11px] text-ink tnum">
            {active}
            <span className="sr-only"> on</span>
          </span>
        )}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="filter-h"
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-[22px] border border-b-0 border-line bg-card p-0 text-bone backdrop:bg-black/55"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-card px-4 py-2.5">
          <h2 id="filter-h" className="text-[15px] font-semibold">
            Filter
          </h2>
          <div className="flex items-center gap-1">
            {active > 0 && (
              <Link href={clearHref} scroll={false} className="inline-flex min-h-11 items-center px-3 text-[13px] font-semibold text-mute">
                Clear all
              </Link>
            )}
            <button type="button" onClick={close} aria-label="Close filters" className="grid size-11 place-items-center rounded-xl text-mute">
              <Icon name="x" className="size-5" />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-4 px-4 pt-3 pb-4">
          {menus.map((m) => (
            <section key={m.label} aria-label={m.label} className="flex flex-col gap-2">
              <h3 className="text-[11.5px] text-mute">{m.label}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {m.options.map((o) => (
                  <li key={o.href}>
                    <Link
                      href={o.href}
                      scroll={false}
                      aria-current={o.active ? "true" : undefined}
                      className={`inline-flex min-h-11 max-w-[16rem] items-center gap-1.5 rounded-xl border px-3 text-[13px] ${o.active ? "border-lime/40 bg-lime/12 font-semibold text-lime" : "border-line bg-well text-bone"}`}
                    >
                      <span className="truncate">{o.label}</span>
                      {o.count !== undefined && <span className="text-[11.5px] text-mute tnum">{o.count}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="sticky bottom-0 border-t border-line bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={close} className="btn-lime min-h-11 w-full rounded-[13px]">
            Show {results} track{results === 1 ? "" : "s"}
          </button>
        </div>
      </dialog>
    </>
  );
}
