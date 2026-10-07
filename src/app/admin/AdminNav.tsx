"use client";

import Link from "next/link";
import { opsSignOut } from "../ops-login/actions";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type IconName = "grid" | "pulse" | "alert" | "inbox" | "users" | "mail" | "list" | "ticket" | "shield" | "flag" | "log" | "chart" | "life" | "rocket" | "back" | "search" | "chevron";
export type NavItem = { href: string; label: string; badge?: number; icon: IconName };
export type NavGroup = { id: string; title: string; icon: IconName; sections: { title: string; items: NavItem[] }[] };

/** Thin line icons, drawn here so the admin needs no icon package. */
function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
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

/**
 * Admin sidebar: every page listed at once, grouped by job (Monitor, Support, Growth, Trust & safety),
 * with counts. Search filters the list (Enter searches users); the arrow collapses it to icons.
 */
export function AdminNav({ groups, admin }: { groups: NavGroup[]; admin: { name: string; initials: string } }) {
  const path = usePathname();
  const router = useRouter();
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(KEY) !== "closed");
    } catch {}
  }, []);
  // Leaving a page (by picking a result or otherwise) ends the search.
  useEffect(() => setQuery(""), [path]);
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(KEY, next ? "open" : "closed");
    } catch {}
  };
  const q = query.trim().toLowerCase();
  const shown = groups
    .map((g) => ({ ...g, items: g.sections.flatMap((s) => s.items).filter((i) => !q || i.label.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length);

  const link = (i: NavItem) => (
    <Link
      key={i.href}
      href={i.href}
      title={open ? undefined : i.label}
      aria-current={isActive(i.href) ? "page" : undefined}
      className={`tactile-item relative flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-[12px] font-medium ${open ? "" : "justify-center"}`}
    >
      <Icon name={i.icon} className="size-4 shrink-0" />
      {open ? (
        <>
          <span className="min-w-0 flex-1 truncate">{i.label}</span>
          {!!i.badge && <span className="rounded bg-lime px-1.5 text-[11px] font-bold text-ink tnum">{i.badge}</span>}
        </>
      ) : (
        <>
          <span className="sr-only">{i.label}</span>
          {!!i.badge && <span aria-hidden className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-lime" />}
        </>
      )}
    </Link>
  );

  return (
    <aside className={`flex h-dvh shrink-0 flex-col border-r border-line bg-ink-2 ${open ? "w-64" : "w-16"}`}>
      <div className={`flex items-center gap-2.5 px-3 pb-3 pt-4 ${open ? "justify-between" : "flex-col"}`}>
        <Link href="/admin" className="flex items-center gap-2.5" aria-label="FloorTest admin">
          {/* Ops has its own brushed-silver crest, so it never looks like the main site. */}
          <img src="/brand/crest-ops.svg" alt="" aria-hidden className="size-8 shrink-0" />
          {open && (
            <span className="flex flex-col leading-tight">
              <span className="text-[14px] font-bold text-bone">FloorTest</span>
              <span className="text-[11px] font-bold uppercase tracking-[1px] text-faint">Admin</span>
            </span>
          )}
        </Link>
        <button type="button" onClick={() => toggle(!open)} aria-label={open ? "Collapse menu" : "Expand menu"} className="grid size-7 place-items-center rounded-md text-faint hover:bg-ink-3 hover:text-bone">
          <Icon name="chevron" className={`size-3.5 transition ${open ? "" : "rotate-180"}`} />
        </button>
      </div>
      {open && (
        <form
          role="search"
          className="mx-3 flex items-center gap-2 rounded-lg border border-line bg-ink-2 px-2.5 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) router.push(`/admin/accounts?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <Icon name="search" className="size-3.5 shrink-0 text-faint" />
          <label htmlFor="admin-q" className="sr-only">
            Search the menu, or press Enter to search users
          </label>
          <input
            id="admin-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, users…"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-bone outline-none placeholder:text-faint"
          />
        </form>
      )}
      <nav aria-label="Admin" className="keep-night tactile-panel mx-2 mb-3 mt-3 flex-1 overflow-y-auto rounded-[20px] p-1.5">
        {open ? (
          <>
            {shown.length === 0 && <p className="tactile-label px-2.5 py-3 text-[11px]">No pages match. Press Enter to search users.</p>}
            {shown.map((g) => (
              <div key={g.id} data-area={g.id} className="mb-3 last:mb-0">
                <p className="area-label px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-[1px]">{g.title}</p>
                <div className="flex flex-col gap-0.5">{g.items.map(link)}</div>
              </div>
            ))}
          </>
        ) : (
          <div className="flex flex-col gap-0.5">
            {groups.map((g) => (
              <div key={g.id} data-area={g.id} className="flex flex-col gap-0.5">
                {g.sections.flatMap((x) => x.items).map(link)}
              </div>
            ))}
          </div>
        )}
      </nav>
      <div className={`flex items-center gap-2 border-t border-line p-3 ${open ? "" : "flex-col"}`}>
        <span title={admin.name} className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-4 text-[11px] font-bold text-bone">
          {admin.initials}
        </span>
        {open && <span className="min-w-0 flex-1 truncate text-[11px] text-mute">{admin.name}</span>}
        <form action={opsSignOut}>
          <button title="Sign out of ops" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-faint hover:bg-ink-3 hover:text-bone">
            <Icon name="back" className="size-3.5" />
            {open ? "Sign out" : <span className="sr-only">Sign out</span>}
          </button>
        </form>
      </div>
    </aside>
  );
}
