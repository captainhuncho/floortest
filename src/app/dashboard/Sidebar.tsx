"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { setActiveCollection } from "./actions";
import { PauseSwitch, type PauseState } from "./PauseSwitch";

type Props = {
  user: { handle: string; name: string };
  link: string;
  collections: { id: number; name: string; closed: boolean }[];
  activeId: number | null;
  needsReview: number;
  cap: { used: number; limit: number; full: boolean };
  pause: PauseState;
  plan: { name: string; upgrade: { name: string; limit: number } | null };
};

export function Sidebar({ user, link, collections, activeId, needsReview, cap, pause, plan }: Props) {
  const path = usePathname();
  const [copied, setCopied] = useState(false);
  const pct = Math.min(100, (cap.used / cap.limit) * 100);

  const nav = [
    { href: "/dashboard/floor", label: "The Floor", active: path === "/dashboard/floor", tab: true },
    { href: "/dashboard", label: "Review Queue", active: path === "/dashboard", badge: needsReview, tab: true },
    { href: "/dashboard/collections", label: "Collections", active: path.startsWith("/dashboard/collections"), tab: true },
    { href: "/dashboard/set", label: "Prepare for set", active: path.startsWith("/dashboard/set"), tab: true },
    { href: "/dashboard/send", label: "Send", active: path.startsWith("/dashboard/send") },
    { href: "/dashboard/contacts", label: "Contacts", active: path.startsWith("/dashboard/contacts") },
    { href: "/dashboard/activity", label: "Activity", active: path.startsWith("/dashboard/activity") },
    { href: "/dashboard/settings", label: "Profile", active: path.startsWith("/dashboard/settings"), mobileOnly: true },
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

      <div className="mx-4 mt-4">
        <PauseSwitch pause={pause} compact />
      </div>

      <div className="mx-4 mt-auto hidden rounded-xl border border-line bg-ink-3 p-3 pt-3 md:block">
        <p className="text-[9px] font-bold uppercase tracking-[1px] text-faint">Your permanent link</p>
        <p className="mt-1.5 truncate text-[12px]">
          {link.replace(/^https?:\/\//, "").replace(user.handle, "")}
          <span className="text-lime">{user.handle}</span>
        </p>
        <div className="mt-3 flex gap-2">
          <button
            className="flex-1 rounded-md bg-bone px-3 py-1.5 text-[11px] font-bold text-ink transition active:scale-95"
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a href={`/${user.handle}`} target="_blank" className="rounded-md border border-line px-3 py-1.5 text-[11px] font-bold text-mute hover:text-bone">
            Preview
          </a>
        </div>
        <form
          className="mt-3"
          action={async (fd) => {
            await setActiveCollection(Number(fd.get("id")));
          }}
        >
          <label htmlFor="routes-to" className="mb-1.5 block text-[9px] font-bold uppercase tracking-[1px] text-faint">
            Sends new tracks to
          </label>
          <select
            id="routes-to"
            name="id"
            defaultValue={activeId ?? undefined}
            key={activeId}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="input py-2 text-[12px]"
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.closed ? " (closed)" : ""}
              </option>
            ))}
          </select>
        </form>
      </div>


      <div className={`p-4 pt-3 ${cap.full ? "" : "hidden md:block"}`}>
        <Link
          href="/dashboard/plans"
          className={`group block rounded-xl border p-3 transition ${cap.full ? "border-danger/50 bg-danger/5" : "border-bone/70 bg-ink-3 hover:border-bone"}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[1px] text-bone">{plan.name} plan</span>
            <span className={`text-xs tnum ${cap.full ? "text-danger" : "text-mute"}`}>
              {cap.used} / {cap.limit.toLocaleString("en-US")}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
            role="meter"
            aria-label="Active songs used"
            aria-valuemin={0}
            aria-valuemax={cap.limit}
            aria-valuenow={cap.used}
          >
            <div className={`h-full rounded-full ${cap.full ? "bg-danger" : "bg-bone"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2.5 text-[11px] leading-snug text-mute">
            {plan.upgrade ? `Upgrade to ${plan.upgrade.name} for ${plan.upgrade.limit.toLocaleString("en-US")} songs` : "You're on the top plan"}
          </p>
          <p className="mt-1.5 text-[10px] font-bold uppercase text-bone group-hover:underline">View plans →</p>
        </Link>
        {cap.full && (
          <p className="mt-2 text-sm text-danger">
            Full: your link is paused. Delete tracks to free space, or{" "}
            <Link href="/dashboard/plans" className="underline">
              upgrade
            </Link>
            .
          </p>
        )}

        <Link
          href="/dashboard/settings"
          aria-current={path.startsWith("/dashboard/settings") ? "page" : undefined}
          className="group mt-3 flex items-center gap-3 rounded-xl border border-line bg-ink-3 px-3 py-2.5 hover:border-mute"
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
