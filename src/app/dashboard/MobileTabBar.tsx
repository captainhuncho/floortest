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
    <span className="absolute right-[calc(50%-1.4rem)] top-1 grid min-w-4 overflow-hidden rounded-full bg-lime px-1 text-center text-[11px] font-bold leading-4 text-ink tnum">
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

/** Phones only: the four places a DJ lives, one thumb away, as separate floating pills (owner, 30 Oct redesign). */
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
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100%-1.75rem)] max-w-[26rem] -translate-x-1/2 items-center gap-1.5 md:hidden"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          // Separate floating pills (owner, 30 Oct mock): frosted, equal width, the label in sentence case under the icon.
          className={`relative flex h-[54px] flex-1 flex-col items-center justify-center gap-[3px] whitespace-nowrap rounded-[27px] border text-[10.5px] font-semibold shadow-[0_10px_26px_-14px_rgba(0,0,0,0.45)] backdrop-blur-xl backdrop-saturate-150 transition duration-100 active:scale-95 motion-reduce:active:scale-100 ${
            t.active
              ? // Soft lime, so the page's one lime button stays the loudest thing on screen.
                "border-lime/40 bg-[color-mix(in_oklab,var(--color-lime)_16%,var(--color-ink-2))] text-lime"
              : "border-line bg-card/80 text-mute"
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
