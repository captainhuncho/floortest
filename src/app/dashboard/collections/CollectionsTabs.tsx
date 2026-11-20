"use client";

import Link from "next/link";
import type { CollectionsTab } from "./add-items";

/**
 * The two tabs of Collections (owner, 19 Nov; option 66, 20 Nov): Callouts (playlists senders send into through your
 * link) and Projects (playlists of your own tracks). They replace All / Callouts / Projects. The tab lives in `?tab=`;
 * old `?kind=callouts` links and /dashboard/projects (a redirect) still land on the right one. Each tab keeps its own
 * address, so the tabs are links; the arrow keys move between them as in any tab list.
 */
const TABS: { key: CollectionsTab; href: string; label: string }[] = [
  { key: "callouts", href: "/dashboard/collections?tab=callouts", label: "Callouts" },
  { key: "projects", href: "/dashboard/collections?tab=projects", label: "Projects" },
];

export function CollectionsTabs({ on }: { on: CollectionsTab }) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>("[role=tab]")];
    const at = tabs.indexOf(document.activeElement as HTMLAnchorElement);
    if (at < 0) return;
    e.preventDefault();
    tabs[(at + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].focus();
  };
  return (
    <div role="tablist" aria-label="Collections" onKeyDown={onKeyDown} className="flex gap-1 rounded-[14px] border border-line bg-card p-1 md:w-[260px] md:shrink-0">
      {TABS.map((t) => {
        const current = on === t.key;
        return (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={current}
            tabIndex={current ? 0 : -1}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-[10px] px-3 text-[14px] font-semibold transition-colors ${current ? "bg-well text-bone" : "text-mute hover:text-bone"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * The tab header (option 66): the tabs, the tab's room line, and + Add aligned right from 768px. On phones + Add floats
 * bottom-right instead (AddMenu places itself), so here it's the tabs with the room line under them.
 */
export function CollectionsBar({ on, room, add }: { on: CollectionsTab; /** One quiet line, e.g. "12 of 500 tracks used on your plan". */ room?: React.ReactNode; /** The + Add menu, when someone here may add. */ add?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
      <CollectionsTabs on={on} />
      <p className="text-[13px] text-mute tnum empty:hidden md:min-w-0 md:flex-1 md:truncate">{room}</p>
      {add && <div className="md:ml-auto md:shrink-0">{add}</div>}
    </div>
  );
}
