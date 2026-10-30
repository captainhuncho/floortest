"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/** Icon from the Figma design, tinted with the tab's text colour. */
const Icon = ({ name }: { name: string }) => (
  <span
    aria-hidden
    className="block size-[18px] bg-current"
    style={{ mask: `url(/icons/${name}.svg) center / contain no-repeat`, WebkitMask: `url(/icons/${name}.svg) center / contain no-repeat` }}
  />
);

/**
 * The Queue count. On first render it just shows; when the count changes while the page is open (a decision, a new
 * track), the old number rolls up and out as the new one rolls in (globals.css [data-roll]). The link reads the count
 * from sr-only text, not the rolling digits.
 */
function QueueBadge({ count }: { count: number }) {
  const [shown, setShown] = useState(count);
  const [roll, setRoll] = useState<{ from: number; n: number } | null>(null);
  if (shown !== count) {
    setShown(count);
    // Only a change between two numbers rolls; the badge appearing (0 → n) is the badge mounting, not a roll.
    setRoll(shown > 0 && count > 0 ? { from: shown, n: (roll?.n ?? 0) + 1 } : null);
  }
  if (!count) return null;
  return (
    <span className="absolute right-1 top-0.5 grid min-w-4 overflow-hidden rounded-full bg-lime px-1 text-center text-[11px] font-bold leading-4 text-ink tnum">
      <span className="sr-only">, {count} need review</span>
      {roll && (
        <span key={`out${roll.n}`} aria-hidden data-roll="out" className="[grid-area:1/1]" onAnimationEnd={() => setRoll(null)}>
          {roll.from}
        </span>
      )}
      <span key={`in${roll?.n ?? 0}`} aria-hidden data-roll={roll ? "in" : undefined} className="[grid-area:1/1]">
        {count}
      </span>
    </span>
  );
}

/** Phones only (Figma "Tab Bar"): the four places a DJ lives, one thumb away. */
export function MobileTabBar({ needsReview }: { needsReview: number }) {
  const path = usePathname();
  const tabs = [
    { href: "/dashboard/floor", label: "Floor", icon: "layout-grid", active: path === "/dashboard/floor" },
    { href: "/dashboard/review", label: "Queue", icon: "arrow-down-circle", active: path === "/dashboard/review", badge: needsReview },
    { href: "/dashboard/collections", label: "Collections", icon: "library", active: path.startsWith("/dashboard/collections") },
    { href: "/dashboard/prepare", label: "Prepare", icon: "clipboard-check", active: path === "/dashboard/prepare" || path.startsWith("/dashboard/prepare/") },
  ];
  return (
    <nav
      aria-label="Main"
      data-tabbar
      className="keep-night fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[min(21rem,calc(100%-3rem))] -translate-x-1/2 items-center justify-between gap-1 rounded-[28px] border border-white/[0.07] bg-gradient-to-b from-[#24261f] to-[#141512] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_4px_rgba(0,0,0,0.5),0_14px_30px_-6px_rgba(0,0,0,0.75)] md:hidden"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          // Tabs size to their label (flex-auto), so "Collections" takes the room it needs and "Prepare" is never cut;
          // all four fit from 320px (mono at 11px with tight tracking ≈ 6.4px a letter, 28 letters + padding ≈ 230px).
          className={`relative flex h-12 flex-auto flex-col items-center justify-center gap-[3px] whitespace-nowrap rounded-[22px] px-1.5 py-1.5 text-[11px] uppercase tracking-[-0.02em] transition duration-100 active:translate-y-px active:scale-95 ${
            t.active
              ? // Soft lime, so the page's one lime button stays the loudest thing on screen (owner, 30 Oct redesign).
                "bg-lime/15 font-bold text-lime shadow-[inset_0_0_0_1px_rgba(213,255,72,0.35)]"
              : "font-medium text-dim active:bg-[#1f211b] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]"
          }`}
        >
          <Icon name={t.icon} />
          {t.label}
          {t.badge !== undefined && <QueueBadge count={t.badge} />}
        </Link>
      ))}
    </nav>
  );
}
