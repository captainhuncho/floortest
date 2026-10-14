"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { Tabs } from "@/components/Tabs";

type Tab = { key: string; label: string; count: number; href: string };

/**
 * Needs review · Kept · Not for me · All. The tapped tab lights up at once and the list fades while the new one
 * loads (the server answers in a moment, but the screen should react now); the page keeps its scroll position, and
 * every tab is preloaded in the background so a switch is usually instant.
 */
export function StatusTabs({ tabs, active }: { tabs: Tab[]; active: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState(active);
  // The server's answer wins once it arrives.
  const [served, setServed] = useState(active);
  if (served !== active) {
    setServed(active);
    setChosen(active);
  }

  // Keep the tabs where they were on screen. On phones the review panel sits above them and changes height with the
  // new tab's first track; without this the tabs and list jump under the finger (iOS Safari has no scroll anchoring).
  const nav = useRef<HTMLElement>(null);
  const topBefore = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (topBefore.current === null || !nav.current) return;
    const shift = nav.current.getBoundingClientRect().top - topBefore.current;
    topBefore.current = null;
    if (Math.abs(shift) > 1) window.scrollBy(0, shift);
  }, [active]);

  return (
    <Tabs
      ref={nav}
      label="Status"
      className="mt-6"
      items={tabs}
      value={chosen}
      data-pending={pending ? "" : undefined}
      aria-busy={pending || undefined}
      linkProps={(t) => ({
        // Load every tab's full page in the background as soon as the tabs are on screen (live site only), so a
        // switch shows content that's already here. Each request crosses the ocean (edge near the user → London), so
        // waiting for the tap costs ~0.5–1 s; phones have no hover to warm it. Decisions refresh this cache.
        prefetch: true,
        scroll: false,
        onMouseEnter: () => router.prefetch(t.href!),
        onFocus: () => router.prefetch(t.href!),
        onClick: (e) => {
          // New tab / window and other modified clicks behave like a normal link.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          if (t.key === chosen) return;
          setChosen(t.key);
          topBefore.current = nav.current?.getBoundingClientRect().top ?? null;
          start(() => router.push(t.href!, { scroll: false }));
        },
      })}
    />
  );
}
