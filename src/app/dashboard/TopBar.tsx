"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Notice } from "@/lib/notifications";
import { clearNotifications, markNotificationsRead, quickSearch, type SearchHit } from "./actions";

type Props = {
  user: { name: string; handle: string };
  notices: { items: Notice[]; unread: number };
};

type Open = null | "search" | "bell";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export function TopBar(p: Props) {
  const [open, setOpen] = useState<Open>(null);
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);

  // One popover at a time; outside click and Escape close it. ⌘K / Ctrl+K opens search.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (open && open !== "search" && !root.current?.contains(t) && !t.closest?.("[data-sheet]")) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => (o === "search" ? null : "search"));
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (k: Exclude<Open, null>) => setOpen((o) => (o === k ? null : k));
  const round = "grid size-9 place-items-center rounded-full border border-ink-4 bg-ink-3 text-mute transition hover:border-mute sm:size-11 sm:border-line sm:bg-ink-2 sm:text-bone";

  return (
    <div ref={root} className="relative flex items-center justify-end gap-2">
      <button className={round} onClick={() => toggle("search")} aria-label="Search (⌘K)" aria-expanded={open === "search"}>
        <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4 4" strokeLinecap="round" />
        </svg>
      </button>

      <div className="relative">
        <button
          className={round}
          onClick={() => toggle("bell")}
          aria-expanded={open === "bell"}
          aria-label={p.notices.unread ? `Notifications, ${p.notices.unread} new` : "Notifications"}
        >
          <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden strokeLinejoin="round">
            <path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 1.5h-13L5 14ZM8 17.5a2 2 0 0 0 4 0" />
          </svg>
          {p.notices.unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1 text-xs font-bold text-ink tnum">
              {p.notices.unread > 9 ? "9+" : p.notices.unread}
            </span>
          )}
        </button>
        {open === "bell" &&
          (window.matchMedia("(max-width: 767px)").matches ? (
            // Phones: a centred sheet over the page, so nothing runs off screen.
            createPortal(<Notifications sheet items={p.notices.items} unread={p.notices.unread} onNavigate={() => setOpen(null)} />, document.getElementById("theme-root") ?? document.body)
          ) : (
            <Notifications items={p.notices.items} unread={p.notices.unread} onNavigate={() => setOpen(null)} />
          ))}
      </div>

      <div className="relative">
        <button
          onClick={() => router.push("/dashboard/account")}
          className="flex items-center gap-3 rounded-full border border-ink-4 bg-ink-3 transition hover:border-mute sm:border-line sm:bg-ink-2 sm:py-1 sm:pl-5 sm:pr-1"
        >
          <span className="hidden text-[15px] sm:inline">{p.user.handle}</span>
          <svg aria-hidden viewBox="0 0 12 12" className="hidden h-3 w-3 -rotate-90 text-mute sm:block" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
          <span className="grid size-9 place-items-center rounded-full text-[10px] font-bold text-bone sm:bg-bone sm:font-sans sm:text-sm sm:text-ink">{initials(p.user.name)}</span>
          <span className="sr-only">Your profile</span>
        </button>
      </div>

      {/* Portal: the blurred header would otherwise trap the fixed overlay inside itself. */}
      {open === "search" && createPortal(<SearchDialog onClose={() => setOpen(null)} />, document.getElementById("theme-root") ?? document.body)}
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`absolute right-0 top-full z-50 mt-3 max-h-[calc(100dvh-90px)] w-[min(400px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-line bg-ink-2 shadow-2xl shadow-black/70 ${className}`}
    >
      {children}
    </div>
  );
}

function Notifications({ items, unread, onNavigate, sheet = false }: { items: Notice[]; unread: number; onNavigate: () => void; sheet?: boolean }) {
  const [clearing, start] = useTransition();
  const [list, setList] = useState(items);
  const router = useRouter();
  // Opening the bell marks everything as seen; the dots stay until the next visit.
  useEffect(() => {
    if (unread) start(() => markNotificationsRead());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const clearable = list.some((n) => n.tone !== "alert");
  const body = (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <p className="font-semibold">
          Notifications {unread > 0 && <span className="ml-1 font-mono text-xs uppercase text-lime">{unread} new</span>}
        </p>
        <div className="flex items-center gap-3">
          {clearable && (
            <button
              type="button"
              disabled={clearing}
              onClick={() =>
                start(async () => {
                  await clearNotifications();
                  setList((l) => l.filter((n) => n.tone === "alert"));
                  router.refresh();
                })
              }
              className="text-sm text-mute underline-offset-4 hover:text-bone hover:underline disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Clear all"}
            </button>
          )}
          <button type="button" onClick={onNavigate} aria-label="Close notifications" className="grid size-8 place-items-center rounded-full text-lg leading-none text-mute hover:bg-ink-3 hover:text-bone">
            ✕
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="px-5 py-10 text-center text-mute">You&apos;re all caught up. New submissions show up here.</p>
      ) : (
        <ul>
          {list.map((n) => (
            <li key={n.id} className="border-b border-line last:border-b-0">
              <Link href={n.href} onClick={onNavigate} className="flex gap-3 px-5 py-3.5 hover:bg-ink-3">
                <span
                  aria-hidden
                  className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.tone === "alert" ? "bg-danger" : n.unread ? "bg-lime" : "bg-transparent"}`}
                />
                <span className="min-w-0">
                  <span className={`block truncate ${n.unread ? "font-medium" : "text-mute"}`}>
                    {n.title}
                    {n.unread && <span className="sr-only"> (new)</span>}
                  </span>
                  <span className="block truncate text-sm text-mute">{n.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/dashboard/notifications" onClick={onNavigate} className="block border-t border-line px-5 py-3 text-center text-sm text-mute hover:text-bone">
        Email settings
      </Link>
    </>
  );
  if (!sheet) return <Panel>{body}</Panel>;
  return (
    <div data-sheet className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-3 pt-20 backdrop-blur-[2px]" onClick={onNavigate}>
      <div
        role="dialog"
        aria-label="Notifications"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100dvh-7rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-ink-2 text-bone shadow-2xl shadow-black/70"
      >
        {body}
      </div>
    </div>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const t = setTimeout(async () => {
      setHits(q.trim() ? await quickSearch(q) : []);
      setActive(0);
    }, 140);
    return () => clearTimeout(t);
  }, [q]);

  // The last two options always search everything.
  const options: SearchHit[] = [
    ...hits,
    ...(q.trim()
      ? [
          { kind: "track" as const, id: -1, title: `Search submissions for “${q.trim()}”`, detail: "", href: `/dashboard?q=${encodeURIComponent(q.trim())}` },
          { kind: "contact" as const, id: -2, title: `Search contacts for “${q.trim()}”`, detail: "", href: `/dashboard/contacts?q=${encodeURIComponent(q.trim())}` },
        ]
      : []),
  ];
  const go = (h: SearchHit) => {
    router.push(h.href);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-ink-2 shadow-2xl shadow-black/70"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-5">
          <svg viewBox="0 0 20 20" className="h-5 w-5 text-mute" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" strokeLinecap="round" />
          </svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(options.length - 1, a + 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
              if (e.key === "Enter" && options[active]) go(options[active]);
            }}
            placeholder="Tracks, artists or contacts"
            aria-label="Search tracks, artists or contacts"
            aria-activedescendant={options[active] ? `hit-${active}` : undefined}
            className="w-full bg-transparent py-4 text-lg outline-none placeholder:text-mute"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-mute">Esc</kbd>
        </div>
        {options.length > 0 && (
          <ul role="listbox" className="max-h-96 overflow-y-auto p-2">
            {options.map((h, i) => (
              <li key={`${h.kind}${h.id}`} id={`hit-${i}`} role="option" aria-selected={i === active}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === active ? "bg-ink-3" : ""}`}
                >
                  <span className="w-16 shrink-0 font-mono text-xs uppercase text-mute">{h.id < 0 ? "All" : h.kind === "track" ? "Track" : "Contact"}</span>
                  <span className="min-w-0">
                    <span className="block truncate">{h.title}</span>
                    {h.detail && <span className="block truncate text-sm text-mute">{h.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!q && <p className="px-5 py-6 text-sm text-mute">Start typing. ↑/↓ to move, Enter to open.</p>}
      </div>
    </div>
  );
}
