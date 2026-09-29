"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const I = {
  floor: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  queue: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8m-3.5-3.5L12 16l3.5-3.5" />
    </>
  ),
  collections: <path d="M5 4v16M9 4v16M13.5 4.5l5.5 15" />,
  prepare: (
    <>
      <rect x="5" y="5" width="14" height="15" rx="2" />
      <path d="M9 3.5h6v3H9zM9 13l2 2 4-4" />
    </>
  ),
};

/** Phones only: the four places a DJ lives, one thumb away. Everything else stays in the header menu. */
export function MobileTabBar({ needsReview }: { needsReview: number }) {
  const path = usePathname();
  const tabs = [
    { href: "/dashboard/floor", label: "Floor", icon: I.floor, active: path === "/dashboard/floor" },
    { href: "/dashboard", label: "Queue", icon: I.queue, active: path === "/dashboard", badge: needsReview },
    { href: "/dashboard/collections", label: "Collections", icon: I.collections, active: path.startsWith("/dashboard/collections") },
    { href: "/dashboard/set", label: "Prepare", icon: I.prepare, active: path.startsWith("/dashboard/set") },
  ];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-4 rounded-[28px] border border-line bg-ink-2/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur md:hidden"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`relative flex flex-col items-center gap-1 rounded-[22px] py-2 font-mono text-[10px] uppercase tracking-wide transition ${
            t.active ? "bg-ink-3 text-bone" : "text-mute"
          }`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            {t.icon}
          </svg>
          {t.label}
          {!!t.badge && (
            <span className="absolute right-[18%] top-1 min-w-4 rounded-full bg-lime px-1 text-center text-[10px] font-semibold leading-4 text-ink tnum" aria-label={`${t.badge} need review`}>
              {t.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
