"use client";

import Link from "next/link";

/**
 * The filter over Collections (owner, 17 Nov: option 43): All, Callouts (what senders send to) or Projects (the desk's
 * own tracks). It replaces the Callouts / Projects switch. Each view keeps its own address, so the tabs are links; the
 * arrow keys move between them as in any tab list.
 */
export type CollectionsFilter = "all" | "callouts" | "projects";

const TABS: { key: CollectionsFilter; href: string; label: string }[] = [
  { key: "all", href: "/dashboard/collections", label: "All" },
  { key: "callouts", href: "/dashboard/collections?kind=callouts", label: "Callouts" },
  { key: "projects", href: "/dashboard/projects", label: "Projects" },
];

export function CollectionsTabs({ on }: { on: CollectionsFilter }) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>("[role=tab]")];
    const at = tabs.indexOf(document.activeElement as HTMLAnchorElement);
    if (at < 0) return;
    e.preventDefault();
    tabs[(at + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].focus();
  };
  return (
    <div role="tablist" aria-label="Show" onKeyDown={onKeyDown} className="flex gap-1">
      {TABS.map((t) => {
        const current = on === t.key;
        return (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={current}
            tabIndex={current ? 0 : -1}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3.5 text-[13px] transition-colors ${current ? "bg-well font-semibold text-bone" : "text-mute hover:text-bone"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
