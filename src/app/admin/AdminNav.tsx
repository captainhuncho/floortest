"use client";

import Link from "next/link";
import { opsSignOut } from "../ops-login/actions";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { stored, useDeviceState } from "@/components/useBrowserValue";

export type IconName = "grid" | "pulse" | "alert" | "inbox" | "users" | "mail" | "list" | "ticket" | "shield" | "flag" | "log" | "chart" | "life" | "rocket" | "back" | "search" | "chevron";
export type NavItem = { href: string; label: string; badge?: number; icon: IconName };
export type NavGroup = { id: string; title: string; icon: IconName; sections: { title: string; items: NavItem[] }[] };

/** Thin line icons, drawn here so the admin needs no icon package. */
export function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  const p = {
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    pulse: "M3 12h4l3-8 4 16 3-8h4",
    alert: "M12 3 2 20h20L12 3zM12 10v4M12 17h.01",
    inbox: "M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z",
    users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8",
    mail: "M3 6h18v12H3zM3 7l9 6 9-6",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    ticket: "M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3zM13 4v16",
    shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
    flag: "M5 21V4M5 4h11l-2 4 2 4H5",
    log: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
    chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
    life: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6",
    rocket: "M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M9 15l-3-3 6-7c2-2 6-2 6-2s0 4-2 6l-7 6zM14 8h.01",
    back: "M15 18l-6-6 6-6",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
    chevron: "M15 18l-6-6 6-6",
  }[name];
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={p} />
    </svg>
  );
}

const KEY = "floortest-admin-panel";

/** Always in the sidebar, whichever area is open (owner, 1 Nov): the pages used every day. Shown only if this person can open them. */
const ESSENTIALS = ["/admin", "/admin/inbox", "/admin/accounts", "/admin/moderation"];

const isActiveFor = (path: string) => (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));

/** The area (top-bar tab) the current page belongs to; Overview when none matches. */
export function currentArea(groups: NavGroup[], path: string) {
  const active = isActiveFor(path);
  return groups.find((g) => g.sections.some((s) => s.items.some((i) => active(i.href)))) ?? groups[0];
}

const areaLabel = (g: NavGroup) => g.title || "Overview";
const areaHref = (g: NavGroup) => g.sections[0]?.items[0]?.href ?? "/admin";
const areaBadge = (g: NavGroup) => g.sections.reduce((n, s) => n + s.items.reduce((m, i) => m + (i.badge ?? 0), 0), 0);

/**
 * The areas along the top (owner, 1 Nov: the sidebar was too crowded). Picking one opens its first page and shows its
 * pages in the sidebar; the count is everything waiting in that area. Wide screens only; phones use AdminMobileNav.
 */
export function AdminTopNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const area = currentArea(groups, path);
  return (
    <nav aria-label="Admin areas" className="sticky top-0 z-20 hidden border-b border-line bg-ink/80 backdrop-blur md:block">
      <ul className="flex gap-1 overflow-x-auto px-6 py-2 [scrollbar-width:none]">
        {groups.map((g) => {
          const on = g.id === area?.id;
          const waiting = areaBadge(g);
          return (
            <li key={g.id} className="shrink-0">
              <Link
                href={areaHref(g)}
                aria-current={on ? "true" : undefined}
                className={`admin-press flex min-h-11 items-center gap-2 rounded-[10px] px-3.5 text-[13.5px] font-semibold transition-colors duration-150 ${on ? "bg-ink-4 text-bone" : "text-mute hover:bg-ink-3 hover:text-bone"}`}
              >
                <Icon name={g.icon} className={`size-4 ${on ? "text-lime" : ""}`} />
                {areaLabel(g)}
                {waiting > 0 && (
                  <span className="rounded-md bg-ink-4 px-1.5 text-[11px] font-bold text-bone tnum">
                    {waiting}
                    <span className="sr-only"> waiting</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Admin sidebar (owner, 1 Nov): Essentials (Overview, Inbox, Users, Moderation) always, then only the pages of the area
 * picked in the top bar. Search finds any page (Enter searches users); the arrow collapses it to icons, with each
 * icon named on focus and hover.
 */
export function AdminNav({ groups, admin }: { groups: NavGroup[]; admin: { name: string; initials: string; role: string } }) {
  const path = usePathname();
  const router = useRouter();
  const active = isActiveFor(path);
  const [open, setOpen] = useDeviceState(() => stored(KEY) !== "closed", true);
  const [query, setQuery] = useState("");
  // Leaving a page (by picking a result or otherwise) ends the search.
  const [searchedOn, setSearchedOn] = useState(path);
  if (searchedOn !== path) {
    setSearchedOn(path);
    setQuery("");
  }
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(KEY, next ? "open" : "closed");
    } catch {}
  };
  const all = groups.flatMap((g) => g.sections.flatMap((s) => s.items));
  const essentials = ESSENTIALS.map((h) => all.find((i) => i.href === h)).filter((i): i is NavItem => !!i);
  const area = currentArea(groups, path);
  const q = query.trim().toLowerCase();
  const found = q ? all.filter((i) => i.label.toLowerCase().includes(q) || groups.some((g) => g.title.toLowerCase().includes(q) && g.sections.some((s) => s.items.includes(i)))) : [];

  const link = (i: NavItem) => {
    const on = active(i.href);
    // Lime count only where something needs a person; plain counts elsewhere.
    const urgent = ["/admin/inbox", "/admin/takedowns", "/admin/incidents", "/admin/plan-requests"].includes(i.href);
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={on ? "page" : undefined}
        aria-label={open ? undefined : `${i.label}${i.badge ? `, ${i.badge} waiting` : ""}`}
        className={`group/nav relative flex min-h-11 items-center gap-2.5 rounded-full px-1.5 text-[13.5px] transition-colors duration-150 ${open ? "" : "justify-center"} ${on ? "bg-ink-4 font-semibold text-bone" : "text-mute hover:bg-ink-3 hover:text-bone"}`}
      >
        {on && <span aria-hidden className="admin-nav-bar absolute -left-2 bottom-2 top-2 w-[3px] rounded-r bg-lime" />}
        {/* Round icon buttons, the current one lit lime (pin 119's side rail). */}
        <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-200 ${on ? "bg-lime text-ink" : "bg-ink-3 text-mute group-hover/nav:text-bone"}`}>
          <Icon name={i.icon} className="size-4" />
        </span>
        {open ? (
          <>
            <span className="min-w-0 flex-1 truncate">{i.label}</span>
            {!!i.badge && <span className={`rounded-md px-1.5 text-[11px] font-bold tnum ${urgent ? "bg-lime text-ink" : "text-bone"}`}>{i.badge}</span>}
          </>
        ) : (
          <>
            {!!i.badge && <span aria-hidden className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-lime" />}
            <span role="tooltip" className="pointer-events-none absolute left-full z-30 ml-3 hidden whitespace-nowrap rounded-md bg-bone px-2 py-1 text-[12px] font-semibold text-ink group-hover/nav:block group-focus-visible/nav:block">
              {i.label}
              {i.badge ? ` · ${i.badge} waiting` : ""}
            </span>
          </>
        )}
      </Link>
    );
  };
  const label = (text: string) => open && <p className="px-2.5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[1px] text-faint">{text}</p>;

  return (
    <aside className={`admin-side flex h-dvh shrink-0 flex-col border-r border-line bg-ink-2 ${open ? "w-64" : "w-16"}`}>
      <div className={`flex items-center gap-2.5 px-3 pb-3 pt-4 ${open ? "justify-between" : "flex-col"}`}>
        <Link href="/admin" className="flex items-center gap-2.5" aria-label="FloorTest admin">
          {/* Ops has its own brushed-silver crest, so it never looks like the main site. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
          <img draggable={false} src="/brand/crest-ops.svg" alt="" aria-hidden className="size-8 shrink-0" />
          {open && (
            <span className="flex flex-col leading-tight">
              <span className="text-[15px] font-extrabold text-bone">FloorTest Ops</span>
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[1px] text-lime">
                <span aria-hidden className="admin-live relative size-1.5 rounded-full bg-lime" />
                Live
              </span>
            </span>
          )}
        </Link>
        <button type="button" onClick={() => toggle(!open)} aria-label={open ? "Collapse menu" : "Expand menu"} className="grid size-11 place-items-center rounded-lg text-faint hover:bg-ink-3 hover:text-bone">
          <Icon name="chevron" className={`size-3.5 transition-transform duration-200 ${open ? "" : "rotate-180"}`} />
        </button>
      </div>
      {open && (
        <form
          role="search"
          className="mx-3 flex items-center gap-2 rounded-[10px] border border-line bg-ink px-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (found.length === 1) router.push(found[0].href);
            else if (query.trim()) router.push(`/admin/accounts?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <Icon name="search" className="size-3.5 shrink-0 text-faint" />
          <label htmlFor="admin-q" className="sr-only">
            Find a page, or press Enter to search users
          </label>
          <input
            id="admin-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a page or user…"
            className="min-h-10 min-w-0 flex-1 bg-transparent text-[13px] text-bone outline-none placeholder:text-faint"
          />
        </form>
      )}
      <nav aria-label="Admin" className="mx-2 mb-3 mt-2 flex-1 overflow-y-auto px-1">
        {q ? (
          <>
            {label("Pages")}
            <div className="flex flex-col gap-0.5">{found.map(link)}</div>
            {!found.length && <p className="px-2.5 py-3 text-[12px] text-faint">No pages match. Press Enter to search users.</p>}
          </>
        ) : (
          <>
            {label("Essentials")}
            <div className="flex flex-col gap-0.5">{essentials.map(link)}</div>
            {area && area.id !== "overview" && (
              <div key={area.id} className="admin-area mt-3 border-t border-line pt-1">
                {open && <p className="px-2.5 pb-1 pt-3 text-[13px] font-bold text-bone">{areaLabel(area)}</p>}
                {area.sections.map((s) => {
                  const items = s.items.filter((i) => !ESSENTIALS.includes(i.href));
                  return items.length > 0 ? (
                    <div key={s.title || area.id}>
                      {s.title && label(s.title)}
                      <div className="flex flex-col gap-0.5">{items.map(link)}</div>
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </>
        )}
      </nav>
      <div className={`flex items-center gap-2 border-t border-line p-3 ${open ? "" : "flex-col"}`}>
        <span title={admin.name} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-4 text-[11px] font-bold text-bone">
          {admin.initials}
        </span>
        {open && (
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[12.5px] font-semibold text-bone">{admin.name}</span>
            <span className="truncate text-[10.5px] font-bold uppercase tracking-[1px] text-faint">{admin.role}</span>
          </span>
        )}
        <form action={opsSignOut}>
          <button title="Sign out of ops" className="grid size-11 place-items-center rounded-lg text-faint hover:bg-ink-3 hover:text-bone">
            <Icon name="back" className="size-4" />
            <span className="sr-only">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
