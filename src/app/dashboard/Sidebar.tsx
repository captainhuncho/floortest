"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { NavIcon, type NavIconName } from "@/components/NavIcon";
import type { PauseState } from "./PauseSwitch";
import { useRail } from "./SidebarRail";

type Props = {
  needsReview: number;
  cap: { used: number; limit: number; full: boolean };
  pause: PauseState;
  /** On a team desk, Members can't send as the account, so Send isn't offered. */
  canSend?: boolean;
};

/** The few icons the rail needs beyond the nav set (same 24px grid, 1.8 stroke). */
const RAIL_PATHS = {
  menu: "M4 6h16M4 12h16M4 18h16",
  pin: "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z",
  alert: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16h.01",
  pause: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 9v6M14 9v6",
} as const;
function RailIcon({ name }: { name: keyof typeof RAIL_PATHS }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.375rem] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={RAIL_PATHS[name]} />
    </svg>
  );
}

/** Folded: 4.5rem of icons. Open: 15rem with labels. Rows are 3rem tall; the icon sits in the centre of the folded rail. */
const ROW = "relative flex shrink-0 rounded-[0.75rem] border pr-3 transition-colors duration-100";
/** An icon row: 3rem tall (2.75rem on short screens), the 1.375rem icon centred in the folded rail. */
const ITEM = `${ROW} h-[clamp(2.75rem,6dvh,3rem)] items-center gap-3.5 text-left pl-[0.8125rem] text-[0.875rem]`;
const IDLE = "border-transparent text-mute hover:bg-card hover:text-bone";

export function Sidebar({ needsReview, cap, pause, canSend = true }: Props) {
  const path = usePathname();
  const { expanded, pinned, setPinned, tapOpen, toggleTap, panelProps } = useRail(path);

  const nav = [
    { href: "/dashboard/floor", label: "Floor", icon: "floor", active: path === "/dashboard/floor", tab: true },
    { href: "/dashboard/review", label: "Review Queue", icon: "queue", active: path === "/dashboard/review", badge: needsReview, tab: true },
    { href: "/dashboard/collections", label: "Collections", icon: "collections", active: path.startsWith("/dashboard/collections"), tab: true },
    { href: "/dashboard/prepare", label: "Prepare", icon: "prepare", active: path === "/dashboard/prepare" || path.startsWith("/dashboard/prepare/"), tab: true },
    ...(canSend ? [{ href: "/dashboard/send", label: "Send", icon: "send", active: path.startsWith("/dashboard/send") }] : []),
    { href: "/dashboard/contacts", label: "Contacts", icon: "contacts", active: path.startsWith("/dashboard/contacts") },
    { href: "/dashboard/activity", label: "Activity", icon: "activity", active: path.startsWith("/dashboard/activity") },
  ];

  // Labels stay in the page when folded (screen readers and tests read them); they only fade out of sight.
  const label = `min-w-0 flex-1 truncate whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none ${expanded ? "opacity-100" : "opacity-0"}`;
  const notice = cap.full
    ? { href: "/dashboard/plans", icon: "alert" as const, tone: "text-danger", text: `Your desk is full (${cap.used}/${cap.limit.toLocaleString("en-US")}), so your link has stopped taking new tracks. Delete tracks you're done with, or see plans →` }
    : pause.on
      ? { href: "/dashboard/account", icon: "pause" as const, tone: "text-mute", text: "Your link is paused. Turn it back on in Account →" }
      : null;

  return (
    // The rail is the page grid's first column: opening widens it and the page makes room (owner, 31 Oct: the menu never
    // covers the page). Only the column's width animates; the page scrolls in its own box, so its scroll position stays.
    <aside
      className={`hidden h-dvh flex-col transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex ${expanded ? "w-60" : "w-18"}`}
    >
      {/* The full wordmark never folds: it sits in the top bar's row, starting at the rail's edge and running into the
          bar's empty left side when the rail is narrow (above the bar, so its frosted fill doesn't cover it). */}
      <div className="relative h-14 shrink-0">
        <Logo href="/" className="absolute left-[1.375rem] top-1/2 z-[45] -translate-y-1/2 whitespace-nowrap" />
      </div>
      <div
        {...panelProps}
        id="desk-menu"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden border-r border-line bg-ink pb-[clamp(0.5rem,2dvh,1.25rem)] text-bone [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [body:has([data-mini-player])_&]:pb-20"
      >
        {/* Touch screens (no hover): a Menu button that opens the labels. */}
        {!pinned && (
          <div className="mx-3 mt-2 hidden shrink-0 [@media(hover:none)]:block">
            <button type="button" onClick={toggleTap} aria-expanded={expanded} aria-controls="desk-menu" className={`${ITEM} ${IDLE} w-full`}>
              <RailIcon name="menu" />
              <span className={label}>{tapOpen ? "Close menu" : "Menu"}</span>
            </button>
          </div>
        )}

        {/* Middle: the places, as one group centred in the height left over, spaced by the screen's height. */}
        <nav aria-label="Main" className="mx-3 flex flex-1 flex-col justify-center gap-[clamp(0.125rem,1.4dvh,1rem)] py-[clamp(0.5rem,2dvh,1.5rem)]">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={n.active ? "page" : undefined}
              className={`${ITEM} ${n.active ? "border-line bg-card font-semibold text-bone" : IDLE}`}
            >
              <NavIcon name={n.icon as NavIconName} className="size-[1.375rem]" />
              <span className={label}>{n.label}</span>
              {"badge" in n && !!n.badge && (
                <span
                  className={`min-w-5 rounded-full bg-lime px-1.5 text-center text-[0.6875rem] font-bold leading-5 text-ink tnum ${
                    expanded ? "absolute right-3 top-1/2 -translate-y-1/2" : "absolute left-[1.75rem] top-1.5"
                  }`}
                  aria-label={`${n.badge} need review`}
                >
                  {n.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Bottom: the desk's state (full, paused) and the choice to keep the menu open. */}
        <div className="mx-3 flex shrink-0 flex-col gap-1">
          {notice && (
            <Link href={notice.href} className={`${ROW} min-h-12 items-start gap-3.5 border-transparent py-3 pl-[0.8125rem] hover:bg-card ${notice.tone}`}>
              <RailIcon name={notice.icon} />
              <span
                className={`text-[0.6875rem] leading-snug transition-opacity duration-150 motion-reduce:transition-none ${
                  expanded ? "min-w-0 flex-1 opacity-100" : "absolute left-14 top-3 w-40 opacity-0"
                }`}
              >
                {notice.text}
              </span>
            </Link>
          )}
          <button type="button" onClick={() => setPinned(!pinned)} aria-pressed={pinned} className={`${ITEM} w-full ${pinned ? "border-transparent text-bone hover:bg-card" : IDLE}`}>
            <RailIcon name="pin" />
            <span className={label}>Pin menu open</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
