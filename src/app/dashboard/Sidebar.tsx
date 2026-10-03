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
};

export function Sidebar({ needsReview, cap, pause }: Props) {
  const path = usePathname();

  const nav = [
    { href: "/dashboard/floor", label: "The Floor", icon: "floor", active: path === "/dashboard/floor", tab: true },
    { href: "/dashboard", label: "Review Queue", icon: "queue", active: path === "/dashboard", badge: needsReview, tab: true },
    { href: "/dashboard/collections", label: "Collections", icon: "collections", active: path.startsWith("/dashboard/collections"), tab: true },
    { href: "/dashboard/set", label: "Prepare for set", icon: "prepare", active: path === "/dashboard/set" || path.startsWith("/dashboard/set/"), tab: true },
    { href: "/dashboard/send", label: "Send", icon: "send", active: path.startsWith("/dashboard/send") },
    { href: "/dashboard/contacts", label: "Contacts", icon: "contacts", active: path.startsWith("/dashboard/contacts") },
    { href: "/dashboard/activity", label: "Activity", icon: "activity", active: path.startsWith("/dashboard/activity") },
  ];

  return (
    <aside className="hidden flex-col border-b border-line bg-ink-2 md:flex md:h-dvh md:overflow-y-auto md:border-b-0 md:border-r">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 md:pb-2">
        <Logo href="/dashboard/floor" />
      </div>

      <nav aria-label="Main" className="keep-night tactile-panel mx-3 mt-3 flex flex-col gap-1 rounded-[22px] p-1.5">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={n.active ? "page" : undefined}
            className="tactile-item relative flex items-center gap-3 rounded-[16px] px-3 py-2.5 text-[12px] font-medium uppercase tracking-[0.5px]"
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
            Your desk is full ({cap.used}/{cap.limit.toLocaleString("en-US")}), so your link is paused. Clear tracks or see plans →
          </Link>
        )}
        {pause.on && !cap.full && (
          <Link href="/dashboard/account" className="mb-3 block rounded-xl border border-line bg-ink-3 p-3 text-[11px] text-mute">
            Submissions are paused. Turn them back on in your profile →
          </Link>
        )}
      </div>
    </aside>
  );
}
