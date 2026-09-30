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
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[min(21rem,calc(100%-3rem))] -translate-x-1/2 items-center justify-between gap-1 rounded-[28px] border border-white/[0.07] bg-gradient-to-b from-[#24261f] to-[#141512] p-1.5 font-[family-name:var(--font-stage-mono)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_4px_rgba(0,0,0,0.5),0_14px_30px_-6px_rgba(0,0,0,0.75)] md:hidden"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`relative flex h-12 flex-1 flex-col items-center justify-center gap-[3px] rounded-[22px] px-1 py-1.5 text-[8px] uppercase transition duration-100 active:translate-y-px active:scale-95 ${
            t.active
              ? "bg-gradient-to-b from-[#353a2d] to-[#23261e] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_6px_rgba(0,0,0,0.55)]"
              : "font-medium text-[#85887f] active:bg-[#1f211b] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]"
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
