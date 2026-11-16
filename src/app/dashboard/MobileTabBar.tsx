"use client";

import Link from "next/link";
import { Dialog } from "@/components/Dialog";
import { NavIcon, type NavIconName } from "@/components/NavIcon";
import { useNavPath } from "@/components/useNavPath";
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
    <span className="absolute right-[calc(50%-1.4rem)] top-0.5 grid min-w-4 overflow-hidden rounded-full bg-lime px-1 text-center text-[11px] font-bold leading-4 text-ink tnum">
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

/** One tab: 48px tall, the label under the icon. The current one sits on a darker pill, in the accent colour. */
const TAB =
  "relative flex h-12 min-w-11 flex-auto flex-col items-center justify-center gap-[3px] whitespace-nowrap rounded-[16px] px-1.5 text-[11px] font-semibold leading-none transition-[background-color,color,scale] duration-100 active:scale-95";
const tabTone = (on: boolean) => (on ? "bg-(--glass-on) text-lime" : "text-mute");

/**
 * Phones only: the menu, the bottom half of the floating pair (BottomPair.tsx; owner's pick, 16 Nov). One glass bar
 * with the four places a DJ lives, and More, which opens the rest as a sheet.
 */
export function MobileTabBar({ needsReview, canSend = false }: { needsReview: number; canSend?: boolean }) {
  const path = useNavPath();
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = [
    { href: "/dashboard/floor", label: "Floor", icon: "layout-grid", active: path === "/dashboard/floor" },
    { href: "/dashboard/collections", label: "Collections", icon: "library", active: path.startsWith("/dashboard/collections") || path.startsWith("/dashboard/projects") },
    { href: "/dashboard/review", label: "Queue", icon: "arrow-down-circle", active: path === "/dashboard/review", badge: needsReview },
    { href: "/dashboard/prepare", label: "Prepare", icon: "clipboard-check", active: path === "/dashboard/prepare" || path.startsWith("/dashboard/prepare/") },
  ];
  // The More sheet, in this order. On a team desk Members can't send as the account, so Send music isn't offered.
  const more: { href: string; label: string; icon: NavIconName; active: boolean }[] = [
    ...(canSend ? [{ href: "/dashboard/send", label: "Send music", icon: "send" as const, active: path.startsWith("/dashboard/send") }] : []),
    { href: "/dashboard/contacts", label: "Contacts", icon: "contacts", active: path.startsWith("/dashboard/contacts") },
    { href: "/dashboard/activity", label: "Activity", icon: "activity", active: path.startsWith("/dashboard/activity") },
    { href: "/dashboard/how-it-works", label: "How it works", icon: "help", active: path === "/dashboard/how-it-works" },
  ];
  const inMore = more.some((m) => m.active);
  return (
    <>
      <nav aria-label="Main" data-tabbar className="glass flex items-center gap-0.5 rounded-[22px] p-1.5">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} className={`${TAB} ${tabTone(t.active)}`}>
            <Icon name={t.icon} />
            {t.label}
            {t.badge !== undefined && <QueueBadge count={t.badge} />}
          </Link>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className={`${TAB} ${tabTone(inMore)}`}>
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.9" />
            <circle cx="12" cy="12" r="1.9" />
            <circle cx="19" cy="12" r="1.9" />
          </svg>
          More
        </button>
      </nav>
      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <nav aria-label="More" className="-mx-2 flex flex-col gap-0.5">
          {more.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              onClick={() => setMoreOpen(false)}
              aria-current={m.active ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3.5 rounded-card px-3 text-[15px] font-medium ${m.active ? "bg-ink-4 text-lime" : "text-bone hover:bg-ink-4"}`}
            >
              <NavIcon name={m.icon} className="size-5 shrink-0" />
              {m.label}
            </Link>
          ))}
        </nav>
      </Dialog>
    </>
  );
}
