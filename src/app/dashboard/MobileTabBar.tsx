"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Icon from the Figma design, tinted with the tab's text colour. */
const Icon = ({ name }: { name: string }) => (
  <span
    aria-hidden
    className="block size-[18px] bg-current"
    style={{ mask: `url(/icons/${name}.svg) center / contain no-repeat`, WebkitMask: `url(/icons/${name}.svg) center / contain no-repeat` }}
  />
);

/** Phones only (Figma "Tab Bar"): the four places a DJ lives, one thumb away. */
export function MobileTabBar({ needsReview }: { needsReview: number }) {
  const path = usePathname();
  const tabs = [
    { href: "/dashboard/floor", label: "Floor", icon: "layout-grid", active: path === "/dashboard/floor" },
    { href: "/dashboard", label: "Queue", icon: "arrow-down-circle", active: path === "/dashboard", badge: needsReview },
    { href: "/dashboard/collections", label: "Collections", icon: "library", active: path.startsWith("/dashboard/collections") },
    { href: "/dashboard/set", label: "Prepare", icon: "clipboard-check", active: path.startsWith("/dashboard/set") },
  ];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex items-center justify-between rounded-[32px] bg-[#1a1c18] p-2 font-[family-name:var(--font-stage-mono)] drop-shadow-[0_8px_12px_rgba(0,0,0,0.4)] md:hidden"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`relative flex h-12 flex-col items-center justify-center gap-[3px] rounded-[24px] px-3 py-1.5 text-[8px] uppercase ${
            t.active ? "bg-[#2a2e24] font-bold text-white" : "font-medium text-[#85887f]"
          }`}
        >
          <Icon name={t.icon} />
          {t.label}
          {!!t.badge && (
            <span className="absolute right-1 top-0.5 min-w-4 rounded-full bg-lime px-1 text-center text-[9px] font-bold leading-4 text-ink tnum" aria-label={`${t.badge} need review`}>
              {t.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
