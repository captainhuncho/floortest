"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { PENDING_GIVE_UP_MS, pendingTarget, shownPath, type PendingNav } from "@/lib/nav-pending";

/**
 * The instant pending state on navigation. A click on a link inside any <nav> records the page it is heading to, so
 * every menu can mark that page as current in the same frame (0 ms), before the server answers. Menus read it through
 * useNavPath() instead of usePathname(). One window listener (after React's own, so the link's navigation has already
 * started) and no state set while mounting: a page under it renders once (PR #338). The pending change is dropped when
 * the address moves on (NavProgress), on Back/Forward, or after PENDING_GIVE_UP_MS.
 */
let pending: PendingNav | null = null;
let giveUp: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function setPendingNav(next: PendingNav | null) {
  if (pending === next) return;
  pending = next;
  clearTimeout(giveUp);
  if (next) giveUp = setTimeout(() => setPendingNav(null), PENDING_GIVE_UP_MS);
  listeners.forEach((l) => l());
}

function onClick(e: MouseEvent) {
  const a = (e.target as Element | null)?.closest?.("nav a[href]");
  if (!(a instanceof HTMLAnchorElement)) return;
  const to = pendingTarget({
    button: e.button,
    modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
    href: a.href,
    target: a.target,
    download: a.hasAttribute("download"),
    origin: location.origin,
    path: location.pathname,
  });
  if (to) setPendingNav({ from: location.pathname, to });
}
const onPop = () => setPendingNav(null);

function subscribe(listener: () => void) {
  if (!listeners.size) {
    window.addEventListener("click", onClick);
    window.addEventListener("popstate", onPop);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    window.removeEventListener("click", onClick);
    window.removeEventListener("popstate", onPop);
  };
}
const read = () => pending;
const none = () => null;

/** The pending page change, if any (null on the server and in the first paint). */
export function usePendingNav(): PendingNav | null {
  return useSyncExternalStore(subscribe, read, none);
}

/** The path a menu marks as current: the tapped page from the moment it is tapped, then the real one. */
export function useNavPath(): string {
  const path = usePathname();
  return shownPath(path, usePendingNav());
}
