"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { stored, useDeviceState } from "@/components/useBrowserValue";
import { useShortcuts } from "../kit/Keys";
import { locate, type AreaId, type ShellData } from "./model";
import { Panel } from "./Panel";
import { PhoneNav } from "./PhoneNav";
import { Rail, type Me } from "./Rail";
import { TopBar } from "./TopBar";
import "./shell.css";

const KEY = "floortest-ops-panel";
/** B's rule: below this width the panel folds into the rail and opens over the page instead. */
const DOCK_QUERY = "(min-width: 1100px)";

/**
 * The new ops shell (admin redesign B, step 2; switch `ops_shell`): rail, section panel and top bar on wide screens,
 * the bottom bar and the More sheet on phones. It replaces today's top tabs and sidebar entirely, so only one
 * navigation is ever live. Server data comes in as props (stable per render); no context, and no state set while
 * mounting, so a page under it renders once (PR #338).
 */
export function OpsShell({ data, me, children }: { data: ShellData; me: Me; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { areas, next, today, total } = data;
  const { area: here, page } = locate(areas, path);
  // Which area the panel shows, and whether it is open over the page; both reset to the current page on a page change.
  const [view, setView] = useState<{ path: string; area: AreaId | undefined; peek: boolean }>({ path, area: here?.id, peek: false });
  if (view.path !== path) setView({ path, area: here?.id, peek: false });
  const [collapsed, setCollapsed] = useDeviceState(() => stored(KEY) === "closed", false);
  const shown = areas.find((a) => a.id === view.area) ?? here;
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const collapse = (next: boolean) => {
    setCollapsed(next);
    setView((v) => ({ ...v, peek: false }));
    try {
      localStorage.setItem(KEY, next ? "closed" : "open");
    } catch {}
  };
  const closePeek = (returnFocus = true) => {
    setView((v) => ({ ...v, peek: false }));
    if (returnFocus) opener.current?.focus();
  };
  const pick = (id: AreaId, from: HTMLElement, single: boolean) => {
    opener.current = from;
    const docked = !collapsed && window.matchMedia(DOCK_QUERY).matches;
    setView((v) => ({ ...v, area: id, peek: !single && !docked && !(v.peek && v.area === id) }));
  };

  // Open over the page: focus goes to its first page, and Escape closes it.
  useEffect(() => {
    if (!view.peek) return;
    panel.current?.querySelector<HTMLElement>("nav a")?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setView((v) => ({ ...v, peek: false }));
      opener.current?.focus();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [view.peek, view.area]);

  // "g" then an area's letter opens its first page (listed under "?").
  useShortcuts(Object.fromEntries(areas.map((a) => [`g ${a.key}`, { label: `Go to ${a.title}`, run: () => router.push(a.href) }])));

  return (
    <div className="ops-shell" data-collapsed={collapsed ? "" : undefined} data-peek={view.peek ? "" : undefined}>
      <Rail areas={areas} current={here?.id} shown={shown?.id} onPick={pick} collapsed={collapsed} onExpand={() => collapse(false)} me={me} />
      {shown && <Panel ref={panel} area={shown} path={path} next={next[shown.id]} today={today[shown.id]} peek={view.peek} onClose={() => closePeek()} onCollapse={() => collapse(true)} />}
      {view.peek && <div aria-hidden className="ops-scrim" onClick={() => closePeek(false)} />}
      <div className="admin-canvas ops-main min-w-0">
        <TopBar area={here} page={page} />
        <main id="main" className="mx-auto max-w-[1240px] px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 sm:px-8 md:pb-10 md:pt-6">
          {children}
        </main>
      </div>
      <PhoneNav areas={areas} total={total} path={path} me={me} />
    </div>
  );
}
