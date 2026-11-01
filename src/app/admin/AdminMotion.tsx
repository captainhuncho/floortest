"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

const SEEN = "floortest-admin-moved";
/** The old "start still" cookie (1 Nov); cleared so a browser that has it doesn't keep it. */
const OLD_COOKIE = "ft_ops_still";
const ARRIVAL_MS = 2500;
let hydrated = false;
const remember = (paths: string[]) => {
  try {
    sessionStorage.setItem(SEEN, JSON.stringify(paths.slice(-60)));
  } catch {}
};

/**
 * When the arrival motion plays. A full load or a browser refresh always plays it, so you can see the page refresh
 * (owner, 1 Nov: "when you hit the refresh or reload on the browser, the pages need to refresh"). Moving inside ops
 * plays it the first time you open each page in a session; a page seen before, a filter or a tab switch starts still
 * (hub, 1 Nov: staff open these pages all day). Only a class on #theme-root changes, so it never blocks a click or a
 * key; reduced motion is handled in admin.css.
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
    const fullLoad = !hydrated;
    hydrated = true;
    if (fullLoad) document.cookie = `${OLD_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    if (!fullLoad && seen.includes(path)) {
      root.classList.add("admin-still");
      return;
    }
    root.classList.remove("admin-still");
    if (!seen.includes(path)) remember([...seen, path]);
    const t = setTimeout(() => root.classList.add("admin-still"), ARRIVAL_MS);
    return () => clearTimeout(t);
  }, [path]);
  return null;
}
