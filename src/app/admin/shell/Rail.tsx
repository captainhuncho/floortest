"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { opsSignOut } from "../../ops-login/actions";
import { Icon } from "../AdminNav";
import { OPEN_PALETTE_EVENT } from "../kit/Palette";
import type { AreaId, ShellArea } from "./model";

export type Me = { name: string; initials: string; role: string };

const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
const TIP = "pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-[9px] bg-ink-4 px-2.5 py-1 text-[12px] font-semibold text-bone group-hover:block group-focus-visible:block";

/**
 * The rail (admin redesign B): one icon per area this person can open, its waiting count on it, then ⌘K search and the
 * profile at the bottom. An area with one page (Overview) is a link; the others show their pages in the panel.
 * Solid, never glass. 44px targets; each button's name says the area and how many wait.
 */
export function Rail({
  areas,
  current,
  shown,
  onPick,
  collapsed,
  onExpand,
  me,
}: {
  areas: ShellArea[];
  current: AreaId | undefined;
  shown: AreaId | undefined;
  onPick: (id: AreaId, opener: HTMLElement, single: boolean) => void;
  collapsed: boolean;
  onExpand: () => void;
  me: Me;
}) {
  return (
    <aside aria-label="Ops" className="ops-rail flex-col items-center gap-1 border-r border-line bg-ink-2 px-2.5 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
      <img draggable={false} src="/brand/crest-ops.svg" alt="" aria-hidden className="mb-2 size-9" />
      <nav aria-label="Ops areas">
        <ul className="flex flex-col items-center gap-1">
          {areas.map((a) => {
            const single = a.sections.length === 1 && a.sections[0].items.length === 1;
            const name = `${a.title}${a.waiting ? `, ${a.waiting} waiting` : ""}`;
            const here = current === a.id;
            const cls = `ops-press group relative grid size-11 place-items-center rounded-[13px] transition-colors duration-150 ${here ? "bg-ink-4 text-bone" : shown === a.id ? "bg-ink-3 text-bone" : "text-faint hover:bg-ink-3 hover:text-bone"}`;
            const inner = (
              <>
                <Icon name={a.icon} className={`size-5 ${here ? "text-lime" : ""}`} />
                {a.waiting > 0 && (
                  <span aria-hidden className="absolute -right-1 -top-1 min-w-[18px] rounded-[9px] bg-lime px-1 text-center text-[10.5px] font-bold leading-[18px] text-[#10110f] tnum shadow-[0_0_0_2px_var(--color-ink-2)]">
                    {a.waiting}
                  </span>
                )}
                <span aria-hidden className={TIP}>
                  {a.title}
                </span>
              </>
            );
            return (
              <li key={a.id}>
                {single ? (
                  <Link href={a.href} aria-label={name} aria-current={here ? "page" : undefined} className={cls} onClick={(e) => onPick(a.id, e.currentTarget, true)}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" aria-label={name} aria-current={here ? "true" : undefined} aria-pressed={shown === a.id} aria-controls="ops-panel" className={cls} onClick={(e) => onPick(a.id, e.currentTarget, false)}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex-1" />
      {collapsed && (
        <button type="button" onClick={onExpand} aria-label="Show the side panel" className="ops-expand group relative size-11 place-items-center rounded-[13px] text-faint hover:bg-ink-3 hover:text-bone">
          <Icon name="panel" className="size-5" />
          <span aria-hidden className={TIP}>
            Show the side panel
          </span>
        </button>
      )}
      <button type="button" onClick={openPalette} aria-label="Search people, pages and actions" aria-keyshortcuts="Meta+K Control+K" className="ops-press group relative grid size-11 place-items-center rounded-[13px] text-faint hover:bg-ink-3 hover:text-bone">
        <Icon name="search" className="size-5" />
        <span aria-hidden className={TIP}>
          Search · ⌘K
        </span>
      </button>
      <Profile me={me} />
    </aside>
  );
}

/** The person signed in: their initials open a small card with their name, role and Sign out. Escape or a click away closes it. */
function Profile({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative mt-1">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${me.name}, ${me.role}`}
        onClick={() => setOpen(!open)}
        className="ops-press grid size-11 place-items-center rounded-full"
      >
        <span className="grid size-9 place-items-center rounded-full bg-ink-4 text-[12px] font-bold text-bone">{me.initials}</span>
      </button>
      <div id={id} hidden={!open} className="kit-floating kit-glass absolute bottom-0 left-full z-50 ml-3 w-60 rounded-[16px] p-3">
        <p className="truncate text-[14px] font-semibold text-bone">{me.name}</p>
        <p className="truncate text-[11.5px] font-bold uppercase tracking-[1px] text-mute">{me.role}</p>
        <form action={opsSignOut} className="mt-2">
          <button className="flex min-h-11 w-full items-center gap-2 rounded-[10px] px-2 text-left text-[13.5px] text-bone hover:bg-ink-3">
            <Icon name="back" className="size-4" />
            Sign out of ops
          </button>
        </form>
      </div>
    </div>
  );
}
