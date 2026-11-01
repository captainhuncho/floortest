"use client";

import { opsSignOut } from "../ops-login/actions";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon, type IconName, type NavGroup } from "./AdminNav";

/** Phones: the current page's name as a button that opens every page, grouped, with the current one marked. */
export function AdminMobileNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const items = groups.flatMap((g) => g.sections.flatMap((s) => s.items));
  const current = items.find((i) => isActive(i.href));
  const waiting = items.reduce((n, i) => n + (i.badge ?? 0), 0);
  useEffect(() => ref.current?.removeAttribute("open"), [path]);
  // The bottom bar: the pages used most, if this person can open them; "More" opens the full menu at the top.
  const tabs = TABS.map((t) => ({ ...t, item: items.find((i) => i.href === t.href) })).filter((t) => t.item);
  const onTab = tabs.some((t) => isActive(t.href));
  return (
    <>
      <nav aria-label="Admin shortcuts" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink-2/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={isActive(t.href) ? "page" : undefined}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold ${isActive(t.href) ? "text-bone" : "text-faint"}`}
            >
              <Icon name={t.icon} className={`size-5 ${isActive(t.href) ? "text-lime" : ""}`} />
              {t.label}
              {!!t.item?.badge && <span className="absolute left-1/2 top-1.5 ml-1.5 rounded bg-lime px-1 text-[10px] font-bold text-ink tnum">{t.item.badge}</span>}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              ref.current?.setAttribute("open", "");
              window.scrollTo({ top: 0 });
            }}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold ${onTab ? "text-faint" : "text-bone"}`}
          >
            <Icon name="list" className={`size-5 ${onTab ? "" : "text-lime"}`} />
            More
          </button>
        </div>
      </nav>
    <details ref={ref} className="group sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur md:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[12px] font-bold [&::-webkit-details-marker]:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
        <img draggable={false} src="/brand/crest-ops.svg" alt="" aria-hidden className="size-7 shrink-0" />
        <span className="text-faint">Admin /</span>
        <span className="min-w-0 flex-1 truncate">{current?.label ?? "Menu"}</span>
        {waiting > 0 && <span className="rounded bg-lime px-1.5 text-[11px] text-ink">{waiting}</span>}
        <span aria-hidden className="text-faint transition group-open:rotate-180">▾</span>
      </summary>
      <nav aria-label="Admin" className="max-h-[70dvh] overflow-y-auto border-t border-line px-2 pb-3">
        {groups.map((g) => (
          <div key={g.id} className="mt-3">
            {g.title && <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-[1px] text-faint">{g.title}</p>}
            {g.sections.flatMap((s) => s.items).map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={isActive(i.href) ? "page" : undefined}
                className={`flex items-center justify-between rounded-lg px-2 py-2 text-[12px] ${isActive(i.href) ? "bg-ink-4 font-bold text-bone" : "text-mute"}`}
              >
                {i.label}
                {!!i.badge && <span className="rounded bg-lime px-1.5 text-[11px] font-bold text-ink">{i.badge}</span>}
              </Link>
            ))}
          </div>
        ))}
        <form action={opsSignOut}>
          <button className="mt-3 block min-h-11 w-full rounded-lg px-2 py-2 text-left text-[12px] text-faint">Sign out of ops</button>
        </form>
      </nav>
    </details>
    </>
  );
}

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Home", icon: "grid" },
  { href: "/admin/inbox", label: "Inbox", icon: "inbox" },
  { href: "/admin/accounts", label: "Users", icon: "users" },
  { href: "/admin/moderation", label: "Safety", icon: "shield" },
];
