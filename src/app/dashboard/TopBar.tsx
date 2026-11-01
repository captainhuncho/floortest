"use client";

import { CuePoint } from "@/components/CuePoint";
import { Chip, Icon, IconBox } from "@/components/Kit";
import { useFocusTrap } from "@/components/useFocusTrap";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Notice } from "@/lib/notifications";
import { clearNotifications, markNotificationsRead, quickSearch, type SearchHit } from "./actions/desk";

type Props = {
  user: { name: string; handle: string; verified: boolean };
  notices: { items: Notice[]; unread: number };
  /** First in the box: the Feedback button (dashboard/FeedbackButton), so the phone bar fits at 320px. */
  lead?: React.ReactNode;
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
  // The redesign's pair box: search, bell and profile share one small raised box, each a 44px square.
  const round = "relative grid size-11 place-items-center rounded-[11px] text-bone transition-colors hover:bg-well aria-expanded:bg-well";

  return (
    <div ref={root} className="relative flex items-center justify-end gap-0.5 rounded-[14px] border border-line bg-card p-[3px]">
      {p.lead}
      <button className={round} onClick={() => toggle("search")} aria-label="Search (⌘K)" aria-expanded={open === "search"}>
        <Icon name="search" />
      </button>

      <div className="relative">
        <button
          className={round}
          onClick={() => toggle("bell")}
          aria-expanded={open === "bell"}
          aria-label={p.notices.unread ? `Notifications, ${p.notices.unread} new` : "Notifications"}
        >
          <Icon name="bell" />
          {p.notices.unread > 0 && (
            <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-lime px-1 text-[10.5px] font-bold text-ink ring-2 ring-card tnum">
              {p.notices.unread > 9 ? "9+" : p.notices.unread}
            </span>
          )}
        </button>
        {open === "bell" &&
          (window.matchMedia("(max-width: 1023px)").matches ? (
            // Phones and narrow windows: a centred sheet over the page. The anchored panel needs room to the left of
            // the bell; below 1024px it would run under the sidebar, where the scrolling main area clips it.
            createPortal(<Notifications sheet items={p.notices.items} unread={p.notices.unread} onNavigate={() => setOpen(null)} />, document.getElementById("theme-root") ?? document.body)
          ) : (
            <Notifications items={p.notices.items} unread={p.notices.unread} onNavigate={() => setOpen(null)} />
          ))}
      </div>

      <div className="relative">
        <button
          onClick={() => router.push("/dashboard/account")}
          className="flex min-h-11 items-center gap-2 rounded-[11px] transition-colors hover:bg-well sm:pl-3"
        >
          <span className="hidden items-center gap-1.5 text-[13px] font-semibold text-bone sm:inline-flex">
            {p.user.handle}
            {p.user.verified && <CuePoint size={16} label="Verified" />}
          </span>
          <Icon name="chev" className="hidden size-3.5 text-mute sm:block" />
          <span className="grid size-11 place-items-center rounded-[11px] bg-ink-4 text-[13px] font-bold text-bone">{initials(p.user.name)}</span>
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
      // Never wider than the main column (the sidebar is 248px): the main area scrolls, so it clips anything past its edge.
      className={`absolute right-0 top-full z-50 mt-3 max-h-[calc(100dvh-90px)] w-[min(400px,calc(100vw-24px))] overflow-y-auto rounded-[18px] border border-line bg-card text-bone shadow-pop md:w-[min(400px,calc(100vw-248px-48px))] ${className}`}
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
      <div className="flex items-center justify-between gap-2 border-b border-line py-2 pl-3 pr-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <IconBox name="bell" small />
          <p className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.015em]">
            Notifications {unread > 0 && <Chip tone="acc">{unread} new</Chip>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
              className="inline-flex min-h-9 items-center rounded-[11px] border border-line bg-well px-3 text-[12px] font-semibold text-bone transition-colors hover:border-line-2 disabled:opacity-50 pointer-coarse:min-h-11"
            >
              {clearing ? "Clearing…" : "Clear all"}
            </button>
          )}
          <button type="button" onClick={onNavigate} aria-label="Close notifications" className="grid size-11 place-items-center rounded-[11px] text-mute transition-colors hover:bg-well hover:text-bone">
            <Icon name="x" className="size-4" />
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-mute">You&apos;re all caught up. New tracks show up here.</p>
      ) : (
        <ul>
          {list.map((n, i) => (
            <li key={n.id} className="border-b border-line last:border-b-0">
              {dayLabel(n.at) !== (i > 0 ? dayLabel(list[i - 1].at) : null) && (
                <p className="bg-well px-4 py-1.5 text-[11.5px] text-mute">{dayLabel(n.at)}</p>
              )}
              <Link href={n.href} onClick={onNavigate} className="flex min-h-11 gap-2.5 px-4 py-2.5 transition-colors hover:bg-well">
                <span
                  aria-hidden
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.tone === "alert" ? "bg-danger" : n.unread ? "bg-lime" : "bg-transparent"}`}
                />
                <span className="min-w-0">
                  <span className={`block truncate text-[13px] ${n.unread ? "font-semibold text-bone" : "text-mute"}`}>
                    {n.title}
                    {n.unread && <span className="sr-only"> (new)</span>}
                  </span>
                  <span className="block truncate text-[11.5px] text-mute">{n.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/dashboard/settings/notifications" onClick={onNavigate} className="flex min-h-11 items-center justify-center border-t border-line px-4 text-[12px] font-semibold text-mute transition-colors hover:text-bone">
        Email settings
      </Link>
    </>
  );
  if (!sheet) return <Panel>{body}</Panel>;
  return <NotificationsSheet onNavigate={onNavigate}>{body}</NotificationsSheet>;
}

/** "Today", "Yesterday", else the day, so a long list reads in stretches rather than one run of rows. */
function dayLabel(at: number) {
  const day = (t: number) => new Date(t).toDateString();
  const t = Date.now();
  if (day(at) === day(t)) return "Today";
  if (day(at) === day(t - 86_400_000)) return "Yesterday";
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function NotificationsSheet({ onNavigate, children }: { onNavigate: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
  return (
    // Clear of the notch at the top and the home bar at the bottom.
    <div
      data-sheet
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+5rem)] backdrop-blur-[2px]"
      onClick={onNavigate}
    >
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-6.5rem)] w-full max-w-md overflow-y-auto rounded-[18px] border border-line bg-card text-bone shadow-pop"
      >
        {children}
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
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => input.current?.focus(), []);
  useFocusTrap(box);

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
          { kind: "track" as const, id: -1, title: `Search submissions for “${q.trim()}”`, detail: "", href: `/dashboard/review?q=${encodeURIComponent(q.trim())}` },
          { kind: "contact" as const, id: -2, title: `Search contacts for “${q.trim()}”`, detail: "", href: `/dashboard/contacts?q=${encodeURIComponent(q.trim())}` },
        ]
      : []),
  ];
  const go = (h: SearchHit) => {
    router.push(h.href);
    onClose();
  };

  return (
    // data-instant: opened from ⌘K as often as from the button, so it appears at once (globals.css).
    // Phones: below the notch, with the results kept short so the field and the first results sit above the keyboard.
    <div data-instant className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-3 pt-[max(12dvh,calc(env(safe-area-inset-top)+1rem))] sm:px-4" onMouseDown={onClose}>
      <div
        ref={box}
        data-instant
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-xl overflow-hidden rounded-[18px] border border-line bg-card text-bone shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
          <IconBox name="search" small />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(options.length - 1, a + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === "Enter" && options[active]) go(options[active]);
            }}
            placeholder="Tracks, artists or contacts"
            aria-label="Search tracks, artists or contacts"
            aria-activedescendant={options[active] ? `hit-${active}` : undefined}
            // A plain box around the text, no lime (owner, 31 Oct): the field is the dialog's only control and already
            // has focus, so its edge just brightens while you type instead of the app-wide focus outline.
            className="min-h-11 w-full rounded-[12px] border border-line bg-well px-3 text-base text-bone transition-colors placeholder:text-mute focus:border-line-2 focus-visible:outline-none sm:text-[15px]"
          />
          <kbd className="hidden rounded-md border border-line bg-well px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-mute sm:inline">Esc</kbd>
        </div>
        {options.length > 0 && (
          <ul role="listbox" className="max-h-[min(24rem,38dvh)] overflow-y-auto overscroll-contain p-1.5 sm:max-h-96">
            {options.map((h, i) => (
              <li key={`${h.kind}${h.id}`} id={`hit-${i}`} role="option" aria-selected={i === active}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-left ${i === active ? "bg-well" : ""}`}
                >
                  <span className="w-16 shrink-0">
                    <Chip tone={h.id < 0 ? "acc" : "flat"}>{h.id < 0 ? "All" : h.kind === "track" ? "Track" : "Contact"}</Chip>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-bone">{h.title}</span>
                    {h.detail && <span className="block truncate text-[11.5px] text-mute">{h.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!q && <p className="px-4 py-5 text-[12px] text-mute">Start typing. ↑/↓ to move, Enter to open.</p>}
      </div>
    </div>
  );
}
