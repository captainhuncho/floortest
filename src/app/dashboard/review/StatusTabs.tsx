"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type Tab = { key: string; label: string; count: number; href: string };

/**
 * Needs review · Kept · Not for me · All. The tapped tab lights up at once and the list fades while the new one
 * loads (the server answers in a moment, but the screen should react now); the page keeps its scroll position, and
 * hovering a tab starts loading it so it's often ready before the click.
 */
export function StatusTabs({ tabs, active }: { tabs: Tab[]; active: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState(active);
  // The server's answer wins once it arrives.
  useEffect(() => setChosen(active), [active]);

  return (
    <nav className="mt-6 flex flex-wrap gap-1 border-b border-line" aria-label="Status" data-pending={pending ? "" : undefined} aria-busy={pending || undefined}>
      {tabs.map((t) => {
        const on = chosen === t.key;
        return (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={on ? "page" : undefined}
            onMouseEnter={() => router.prefetch(t.href)}
            onFocus={() => router.prefetch(t.href)}
            onClick={(e) => {
              // New tab / window and other modified clicks behave like a normal link.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              if (t.key === chosen) return;
              setChosen(t.key);
              start(() => router.push(t.href, { scroll: false }));
            }}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              on ? "border-lime text-bone" : "border-transparent text-mute hover:text-bone"
            }`}
          >
            {t.label} <span className="tnum text-mute">{t.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}
