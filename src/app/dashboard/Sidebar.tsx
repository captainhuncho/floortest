"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import type { PauseState } from "./PauseSwitch";

type Props = {
  user: { handle: string; name: string };
  needsReview: number;
  cap: { used: number; limit: number; full: boolean };
  pause: PauseState;
};

export function Sidebar({ user, needsReview, cap, pause }: Props) {
  const path = usePathname();

  const nav = [
    { href: "/dashboard/floor", label: "The Floor", active: path === "/dashboard/floor", tab: true },
    { href: "/dashboard", label: "Review Queue", active: path === "/dashboard", badge: needsReview, tab: true },
    { href: "/dashboard/collections", label: "Collections", active: path.startsWith("/dashboard/collections"), tab: true },
    { href: "/dashboard/set", label: "Prepare for set", active: path === "/dashboard/set" || path.startsWith("/dashboard/set/"), tab: true },
    { href: "/dashboard/send", label: "Send", active: path.startsWith("/dashboard/send") },
    { href: "/dashboard/contacts", label: "Contacts", active: path.startsWith("/dashboard/contacts") },
    { href: "/dashboard/activity", label: "Activity", active: path.startsWith("/dashboard/activity") },
  ];

  return (
    <aside className="hidden flex-col border-b border-line bg-ink-2 font-[family-name:var(--font-stage-mono)] md:flex md:h-dvh md:overflow-y-auto md:border-b-0 md:border-r">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-lime focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 md:pb-2">
        <Logo href="/dashboard/floor" />
      </div>

      <nav aria-label="Main" className="mt-3 flex gap-1 overflow-x-auto px-2 pb-2 md:mt-2 md:flex-col md:gap-0.5 md:pb-0">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={n.active ? "page" : undefined}
            className={`${"mobileOnly" in n ? "md:hidden" : ""} ${"tab" in n ? "hidden md:flex" : "flex"} shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2.5 text-[11px] uppercase tracking-[0.5px] transition ${
              n.active ? "bg-ink-3 font-bold text-bone" : "font-medium text-mute hover:bg-ink-3/60 hover:text-bone"
            }`}
          >
            <span className="flex items-center gap-3">
              <span aria-hidden className={`size-1 rounded-full ${n.active ? "bg-bone" : "bg-faint"}`} />
              {n.label}
            </span>
            {"badge" in n && !!n.badge && (
              <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold text-ink tnum" aria-label={`${n.badge} need review`}>
                {n.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="mt-auto p-4">
        {cap.full && (
          <Link href="/dashboard/plans" className="mb-3 block rounded-xl border border-danger/50 bg-danger/5 p-3 text-[11px] text-danger">
            Your desk is full ({cap.used}/{cap.limit.toLocaleString("en-US")}), so your link is paused. Clear tracks or see plans →
          </Link>
        )}
        {pause.on && !cap.full && (
          <Link href="/dashboard/account" className="mb-3 block rounded-xl border border-line bg-ink-3 p-3 text-[11px] text-mute">
            Submissions are paused. Turn them back on in your profile →
          </Link>
        )}
        <Link
          href="/dashboard/account"
          aria-current={path.startsWith("/dashboard/account") ? "page" : undefined}
          className="group flex items-center gap-3 rounded-xl border border-line bg-ink-3 px-3 py-2.5 hover:border-mute"
        >
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bone text-xs font-bold text-ink">
            {user.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase())
              .join("")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-bold">{user.name}</span>
            <span className="block text-[10px] text-faint group-hover:text-mute">{pause.on ? "Link paused" : "Receiver link active"}</span>
          </span>
          <span aria-hidden className="text-mute group-hover:text-bone">
            →
          </span>
        </Link>
      </div>
    </aside>
  );
}
