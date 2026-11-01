"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

/** Set once the first ops page of a browser session has played its arrival, so later full loads start still. */
export const MOTION_COOKIE = "ft_ops_still";
const SEEN = "floortest-admin-moved";
const ARRIVAL_MS = 2500;
let hydrated = false;
const remember = (paths: string[]) => {
  try {
    sessionStorage.setItem(SEEN, JSON.stringify(paths.slice(-60)));
  } catch {}
};

/**
 * Arrival motion plays once per page per browser session (hub, 1 Nov: staff open these pages all day). A page seen
 * before, a refresh, a filter or a tab switch starts still. Only adds or removes a class on #theme-root, so it never
 * blocks a click or a key; reduced motion is handled in admin.css.
 */
export function AdminMotion() {
  const path = usePathname();
  useLayoutEffect(() => {
    const root = document.getElementById("theme-root");
    if (!root) return;
    let seen: string[] = [];
    try {
      seen = JSON.parse(sessionStorage.getItem(SEEN) ?? "[]");
    } catch {}
    // A full load the server already rendered still has painted by now: starting the motion here would replay it late.
    const paintedStill = !hydrated && root.classList.contains("admin-still");
    hydrated = true;
    if (paintedStill || seen.includes(path)) {
      root.classList.add("admin-still");
      if (!seen.includes(path)) remember([...seen, path]);
      return;
    }
    root.classList.remove("admin-still");
    remember([...seen, path]);
    // A session cookie (no expiry, UI only): the server renders later full loads still, so a refresh doesn't replay.
    document.cookie = `${MOTION_COOKIE}=1; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    const t = setTimeout(() => root.classList.add("admin-still"), ARRIVAL_MS);
    return () => clearTimeout(t);
  }, [path]);
  return null;
}
