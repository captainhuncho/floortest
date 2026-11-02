"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { setPendingNav, usePendingNav } from "./useNavPath";

/**
 * A thin lime line along the top of the screen while a tapped page is on its way (useNavPath.ts). Always in the page and
 * fixed, so it never moves anything; it fades in only after 150 ms (globals.css .nav-progress), so a quick page change
 * shows nothing. Once the address changes the pending change is over and the line goes.
 */
export function NavProgress() {
  const path = usePathname();
  const pending = usePendingNav();
  useEffect(() => {
    if (pending && pending.from !== path) setPendingNav(null);
  }, [path, pending]);
  return <div aria-hidden className="nav-progress" data-on={pending && pending.from === path ? "" : undefined} />;
}
