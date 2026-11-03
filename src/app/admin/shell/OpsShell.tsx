"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { stored, useDeviceState } from "@/components/useBrowserValue";
import { useNavPath } from "@/components/useNavPath";
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
/** Hover opens a rail area only with a real mouse: touch screens never open-then-close on a tap. Read at each move, so a
 * touch laptop that plugs in a mouse (or unplugs it) is answered without listening for the change. */
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";
/** Resting on an area this long shows it; leaving the area and the panel this long puts it back. */
const OPEN_MS = 150;
const CLOSE_MS = 300;

/** An area shown by resting the mouse on it, not picked: `over` when it opens over the page (panel not docked). */
type Hover = { area: AreaId; over: boolean };

/**
 * The new ops shell (admin redesign B, step 2; switch `ops_shell`): rail, section panel and top bar on wide screens,
 * the bottom bar and the More sheet on phones. It replaces today's top tabs and sidebar entirely, so only one
 * navigation is ever live. Server data comes in as props (stable per render); no context, and no state set while
 * mounting, so a page under it renders once (PR #338).
 */
export function OpsShell({ data, me, children }: { data: ShellData; me: Me; children: React.ReactNode }) {
  // The tapped page from the moment it is tapped (useNavPath.ts), so the rail, panel and phone bar answer at once.
  const path = useNavPath();
  const router = useRouter();
  const { areas, next, today, total } = data;
  const { area: here, page } = locate(areas, path);
  // Which area the panel shows, whether it is open over the page, and an area the mouse rests on; all reset to the
  // current page on a page change.
  const [view, setView] = useState<{ path: string; area: AreaId | undefined; peek: boolean; hover?: Hover }>({ path, area: here?.id, peek: false });
  if (view.path !== path) setView({ path, area: here?.id, peek: false });
  const [collapsed, setCollapsed] = useDeviceState(() => stored(KEY) === "closed", false);
  const shown = areas.find((a) => a.id === (view.hover?.area ?? view.area)) ?? here;
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const collapse = (next: boolean) => {
    setCollapsed(next);
    setView((v) => ({ ...v, peek: false }));
    try {
      localStorage.setItem(KEY, next ? "closed" : "open");
    } catch {}
  };
  const closePeek = (returnFocus = true) => {
    clearTimeout(timer.current);
    setView((v) => ({ ...v, peek: false, hover: undefined }));
    if (returnFocus) opener.current?.focus();
  };
  const pick = (id: AreaId, from: HTMLElement, single: boolean) => {
    clearTimeout(timer.current);
    opener.current = from;
    const docked = !collapsed && window.matchMedia(DOCK_QUERY).matches;
    setView((v) => ({ ...v, area: id, peek: !single && !docked && !(v.peek && v.area === id), hover: undefined }));
  };
  // Hover (mouse only): resting on an area shows it after OPEN_MS; leaving the area and the panel puts back what was
  // picked after CLOSE_MS, so crossing from the icon into the panel keeps it. A click pins it as before. Focus stays put.
  const hoverArea = (id: AreaId) => {
    if (!window.matchMedia(HOVER_QUERY).matches) return;
    clearTimeout(timer.current);
    const over = collapsed || !window.matchMedia(DOCK_QUERY).matches;
    timer.current = setTimeout(() => setView((v) => ({ ...v, hover: { area: id, over } })), OPEN_MS);
  };
  const hoverStay = () => clearTimeout(timer.current);
  const hoverLeave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setView((v) => (v.hover ? { ...v, hover: undefined } : v)), CLOSE_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

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

  // Escape puts back an area shown by hover (before the open panel's own Escape, which closes a picked one).
  const hovering = view.hover !== undefined;
  useEffect(() => {
    if (!hovering) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      clearTimeout(timer.current);
      setView((v) => ({ ...v, hover: undefined }));
    };
    document.addEventListener("keydown", esc, true);
    return () => document.removeEventListener("keydown", esc, true);
  }, [hovering]);

  // "g" then an area's letter opens its first page (listed under "?").
  useShortcuts(Object.fromEntries(areas.map((a) => [`g ${a.key}`, { label: `Go to ${a.title}`, run: () => router.push(a.href) }])));

  return (
    <div className="ops-shell" data-collapsed={collapsed ? "" : undefined} data-peek={view.peek || view.hover?.over ? "" : undefined}>
      <Rail areas={areas} current={here?.id} shown={shown?.id} onPick={pick} onHover={hoverArea} onLeave={hoverLeave} collapsed={collapsed} onExpand={() => collapse(false)} me={me} />
      {shown && (
        <Panel
          ref={panel}
          area={shown}
          path={path}
          next={next[shown.id]}
          today={today[shown.id]}
          peek={view.peek || !!view.hover?.over}
          onClose={() => closePeek(view.peek)}
          onCollapse={() => collapse(true)}
          onPointerEnter={hoverStay}
          onPointerLeave={hoverLeave}
        />
      )}
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
