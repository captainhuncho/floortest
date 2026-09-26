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
  collections: { id: number; name: string }[];
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
    { href: "/dashboard/floor", label: "The Floor", active: path === "/dashboard/floor" },
    { href: "/dashboard", label: "Submissions", active: path === "/dashboard", badge: needsReview },
    { href: "/dashboard/collections", label: "Collections", active: path.startsWith("/dashboard/collections") },
    { href: "/dashboard/contacts", label: "Contacts", active: path.startsWith("/dashboard/contacts") },
    { href: "/dashboard/activity", label: "Activity", active: path.startsWith("/dashboard/activity") },
    { href: "/dashboard/settings", label: "Profile", active: path.startsWith("/dashboard/settings"), mobileOnly: true },
  ];

  return (
    <aside className="flex flex-col border-b border-line bg-ink-2 md:h-dvh md:overflow-y-auto md:border-b-0 md:border-r">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-lime focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 md:pb-2">
        <Logo href="/dashboard/floor" />
        <button
          className="btn-ghost btn-sm md:hidden"
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy my link"}
        </button>
      </div>

      <nav aria-label="Main" className="mt-3 flex gap-1 overflow-x-auto px-2 pb-2 md:mt-2 md:flex-col md:gap-0.5 md:pb-0">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={n.active ? "page" : undefined}
            className={`${"mobileOnly" in n ? "md:hidden" : ""} flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2.5 transition ${
              n.active ? "bg-ink-3 font-medium text-bone" : "text-mute hover:bg-ink-3/60 hover:text-bone"
            }`}
          >
            {n.label}
            {"badge" in n && !!n.badge && (
              <span className="rounded-full bg-lime px-2 py-0.5 text-xs font-semibold text-ink tnum" aria-label={`${n.badge} need review`}>
                {n.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="mx-4 mt-6 hidden rounded-lg border border-line bg-ink p-3 md:block">
        <p className="label">Your permanent link</p>
        <p className="mt-1.5 truncate font-mono text-sm">
          {link.replace(/^https?:\/\//, "").replace(user.handle, "")}
          <span className="text-lime">{user.handle}</span>
        </p>
        <div className="mt-3 flex gap-2">
          <button
            className="btn-lime btn-sm flex-1"
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a href={`/${user.handle}`} target="_blank" className="btn-ghost btn-sm">
            Preview
          </a>
        </div>
        <form
          className="mt-3"
          action={async (fd) => {
            await setActiveCollection(Number(fd.get("id")));
          }}
        >
          <label htmlFor="routes-to" className="label mb-1.5 block">
            Sends new tracks to
          </label>
          <select
            id="routes-to"
            name="id"
            defaultValue={activeId ?? undefined}
            key={activeId}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="input py-2"
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </form>
      </div>

      <div className="mx-4 mt-3">
        <PauseSwitch pause={pause} />
      </div>

      <div className={`mt-auto p-4 ${cap.full ? "" : "hidden md:block"}`}>
        <Link
          href="/dashboard/settings#plan-h"
          className={`group block rounded-lg border p-3 transition ${
            cap.full ? "border-danger/50 bg-danger/5" : "border-lime/40 bg-gradient-to-br from-lime/10 to-transparent hover:border-lime/70"
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="label">{plan.name} plan</span>
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
            <div className={`h-full rounded-full ${cap.full ? "bg-danger" : "bg-lime"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2.5 text-sm font-semibold leading-snug">
            {plan.upgrade ? `Upgrade to ${plan.upgrade.name} for ${plan.upgrade.limit.toLocaleString("en-US")} songs` : "You're on the top plan"}
          </p>
          <p className="mt-1 font-mono text-xs uppercase text-lime group-hover:underline">View plans →</p>
        </Link>
        {cap.full && (
          <p className="mt-2 text-sm text-danger">
            Full: your link is paused. Delete tracks to free space, or{" "}
            <Link href="/dashboard/settings" className="underline">
              upgrade
            </Link>
            .
          </p>
        )}

        <Link
          href="/dashboard/settings"
          aria-current={path.startsWith("/dashboard/settings") ? "page" : undefined}
          className="group mt-4 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-ink-3"
        >
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bone text-xs font-bold text-ink">
            {user.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase())
              .join("")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block text-xs text-mute group-hover:text-bone">View profile</span>
          </span>
          <span aria-hidden className="text-mute group-hover:text-bone">
            →
          </span>
        </Link>
      </div>
    </aside>
  );
}
