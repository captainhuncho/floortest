"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { NavIcon, type NavIconName } from "@/components/NavIcon";
import type { PauseState } from "./PauseSwitch";

type Props = {
  needsReview: number;
  cap: { used: number; limit: number; full: boolean };
  pause: PauseState;
  /** On a team desk, Members can't send as the account, so Send isn't offered. */
  canSend?: boolean;
};

export function Sidebar({ needsReview, cap, pause, canSend = true }: Props) {
  const path = usePathname();

  const nav = [
    { href: "/dashboard/floor", label: "Floor", icon: "floor", active: path === "/dashboard/floor", tab: true },
    { href: "/dashboard/review", label: "Review Queue", icon: "queue", active: path === "/dashboard/review", badge: needsReview, tab: true },
    { href: "/dashboard/collections", label: "Collections", icon: "collections", active: path.startsWith("/dashboard/collections"), tab: true },
    { href: "/dashboard/prepare", label: "Prepare", icon: "prepare", active: path === "/dashboard/prepare" || path.startsWith("/dashboard/prepare/"), tab: true },
    ...(canSend ? [{ href: "/dashboard/send", label: "Send", icon: "send", active: path.startsWith("/dashboard/send") }] : []),
    { href: "/dashboard/contacts", label: "Contacts", icon: "contacts", active: path.startsWith("/dashboard/contacts") },
    { href: "/dashboard/activity", label: "Activity", icon: "activity", active: path.startsWith("/dashboard/activity") },
  ];

  return (
    <aside className="hidden flex-col border-b border-line bg-ink text-bone md:flex md:h-dvh md:overflow-y-auto md:border-b-0 md:border-r">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 md:pb-2">
        <Logo href="/" />
      </div>

      {/* Plain rows, the current one on a card (owner, 30 Oct redesign; it was a dark tactile panel with capitals). */}
      <nav aria-label="Main" className="mx-3 mt-4 flex flex-col gap-0.5">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={n.active ? "page" : undefined}
            className={`relative flex min-h-10 items-center gap-2.5 rounded-[11px] border px-2.5 text-[13px] transition-colors duration-100 ${n.active ? "border-line bg-card font-semibold text-bone" : "border-transparent text-mute hover:bg-card hover:text-bone"}`}
          >
            <NavIcon name={n.icon as NavIconName} />
            <span className="min-w-0 flex-1 truncate">{n.label}</span>
            {"badge" in n && !!n.badge && (
              <span className="min-w-5 rounded-full bg-lime px-1.5 text-center text-[11px] font-bold leading-5 text-ink tnum" aria-label={`${n.badge} need review`}>
                {n.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="mt-auto p-4">
        {cap.full && (
          <Link href="/dashboard/plans" className="mb-3 block rounded-xl border border-danger/50 bg-danger/5 p-3 text-[11px] text-danger">
            Your desk is full ({cap.used}/{cap.limit.toLocaleString("en-US")}), so your link has stopped taking new tracks. Delete tracks you&apos;re done with, or see plans →
          </Link>
        )}
        {pause.on && !cap.full && (
          <Link href="/dashboard/account" className="mb-3 block card p-3 text-[11px] text-mute">
            Your link is paused. Turn it back on in Account →
          </Link>
        )}
      </div>
    </aside>
  );
}
