"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { NavGroup } from "./AdminNav";

/** Phones: the current page's name as a button that opens every page, grouped, with the current one marked. */
export function AdminMobileNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const items = groups.flatMap((g) => g.sections.flatMap((s) => s.items));
  const current = items.find((i) => isActive(i.href));
  const waiting = items.reduce((n, i) => n + (i.badge ?? 0), 0);
  useEffect(() => ref.current?.removeAttribute("open"), [path]);
  return (
    <details ref={ref} className="group sticky top-0 z-30 border-b border-line bg-ink/95 font-[family-name:var(--font-stage-mono)] backdrop-blur md:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[12px] font-bold [&::-webkit-details-marker]:hidden">
        <span className="text-faint">Admin /</span>
        <span className="min-w-0 flex-1 truncate">{current?.label ?? "Menu"}</span>
        {waiting > 0 && <span className="rounded bg-lime px-1.5 text-[10px] text-ink">{waiting}</span>}
        <span aria-hidden className="text-faint transition group-open:rotate-180">▾</span>
      </summary>
      <nav aria-label="Admin" className="max-h-[70dvh] overflow-y-auto border-t border-line px-2 pb-3">
        {groups.map((g) => (
          <div key={g.id} className="mt-3">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[1px] text-faint">{g.title}</p>
            {g.sections.flatMap((s) => s.items).map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={isActive(i.href) ? "page" : undefined}
                className={`flex items-center justify-between rounded-lg px-2 py-2 text-[12px] ${isActive(i.href) ? "bg-ink-4 font-bold text-bone" : "text-mute"}`}
              >
                {i.label}
                {!!i.badge && <span className="rounded bg-lime px-1.5 text-[10px] font-bold text-ink">{i.badge}</span>}
              </Link>
            ))}
          </div>
        ))}
        <Link href="/dashboard/floor" className="mt-3 block rounded-lg px-2 py-2 text-[12px] text-faint">← Back to my desk</Link>
      </nav>
    </details>
  );
}
