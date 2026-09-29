"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import type { Notice } from "@/lib/notifications";
import { logout } from "../(auth)/actions";
import { markNotificationsRead, quickSearch, type SearchHit } from "./actions";
import { PauseSwitch, type PauseState } from "./PauseSwitch";

type Props = {
  user: { name: string; email: string; handle: string; plan: string; memberSince: string };
  link: string;
  notices: { items: Notice[]; unread: number };
  footer: { label: string; href: string; external: boolean }[];
  version: string;
  /** Phones: the sidebar is hidden, so its switch lives in the profile menu. */
  pause: PauseState;
};

type Open = null | "search" | "bell" | "profile" | "qr";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export function TopBar(p: Props) {
  const [open, setOpen] = useState<Open>(null);
  const root = useRef<HTMLDivElement>(null);

  // One popover at a time; outside click and Escape close it. ⌘K / Ctrl+K opens search.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (open && open !== "search" && open !== "qr" && !root.current?.contains(e.target as Node)) setOpen(null);
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
  const round = "grid size-9 place-items-center rounded-full border border-[#2a2e24] bg-[#1f201c] text-[#a3a69b] transition hover:border-mute sm:size-11 sm:border-line sm:bg-ink-2 sm:text-bone";

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
        {open === "bell" && <Notifications items={p.notices.items} unread={p.notices.unread} onNavigate={() => setOpen(null)} />}
      </div>

      <div className="relative">
        <button
          onClick={() => toggle("profile")}
          aria-expanded={open === "profile"}
          aria-haspopup="menu"
          className="flex items-center gap-3 rounded-full border border-[#2a2e24] bg-[#1f201c] transition hover:border-mute sm:border-line sm:bg-ink-2 sm:py-1 sm:pl-5 sm:pr-1"
        >
          <span className="hidden text-[15px] sm:inline">{p.user.handle}</span>
          <svg aria-hidden viewBox="0 0 12 12" className={`hidden h-3 w-3 text-mute transition sm:block ${open === "profile" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
          <span className="grid size-9 place-items-center rounded-full font-[family-name:var(--font-stage-mono)] text-[10px] font-bold text-white sm:bg-bone sm:font-sans sm:text-sm sm:text-ink">{initials(p.user.name)}</span>
          <span className="sr-only">Account menu</span>
        </button>
        {open === "profile" && <ProfilePanel {...p} onNavigate={() => setOpen(null)} onQr={() => setOpen("qr")} />}
      </div>

      {/* Portal: the blurred header would otherwise trap the fixed overlay inside itself. */}
      {open === "search" && createPortal(<SearchDialog onClose={() => setOpen(null)} />, document.body)}
      {open === "qr" && createPortal(<QrDialog handle={p.user.handle} link={p.link} onClose={() => setOpen(null)} />, document.body)}
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

function ProfilePanel({ user, link, footer, version, pause, onNavigate, onQr }: Props & { onNavigate: () => void; onQr: () => void }) {
  const toast = useToast();
  const items = [
    { icon: "+", title: "Referrals", sub: "Invite DJs · earn track slots", href: "/dashboard/referrals" },
    { icon: "↗", title: "Submission link", sub: link.replace(/^https?:\/\//, ""), href: `/${user.handle}`, external: true, copy: true },
    { icon: "✉", title: "Emails to senders", sub: "Everything FloorTest told them", href: "/dashboard/emails" },
  ];
  // Phones: the sidebar is hidden, so its links move here.
  const mobile = [
    { icon: "↑", title: "Send", sub: "Send music to another FloorTest user", href: "/dashboard/send" },
    { icon: "☰", title: "Contacts", sub: "Everyone who sent you music", href: "/dashboard/contacts" },
    { icon: "◷", title: "Activity", sub: "Everything you did, newest first", href: "/dashboard/activity" },
    { icon: "⚙", title: "Profile & settings", sub: "Plan, security, public page", href: "/dashboard/settings" },
    { icon: "✎", title: "Feedback", sub: "Tell us what to fix or build", href: "/contact?topic=feedback" },
  ];
  return (
    <Panel>
      <div role="menu" aria-label="Account">
        <div className="flex items-center gap-4 border-b border-line p-6">
          <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-bone text-lg font-bold text-ink">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{user.name}</p>
            <p className="truncate font-mono text-sm text-mute">{user.email}</p>
            <p className="font-mono text-xs text-mute">Member since {user.memberSince}</p>
          </div>
          <span className="shrink-0 self-start rounded-full bg-lime px-2.5 py-0.5 font-mono text-xs font-semibold uppercase text-ink">{user.plan}</span>
        </div>

        <div className="border-b border-line px-6 py-4 md:hidden">
          <PauseSwitch pause={pause} />
        </div>
        <ul className="border-b border-line px-2 py-2 md:hidden">
          {mobile.map((i) => (
            <li key={i.title}>
              <Link href={i.href} onClick={onNavigate} role="menuitem" className="group flex items-center gap-4 rounded-xl px-4 py-3 hover:bg-ink-3">
                <span aria-hidden className="w-6 shrink-0 text-center text-lg text-mute">
                  {i.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{i.title}</span>
                  <span className="block truncate font-mono text-xs text-mute">{i.sub}</span>
                </span>
                <span aria-hidden className="text-xl text-mute">→</span>
              </Link>
            </li>
          ))}
        </ul>
        <ul className="px-2 py-2">
          <li>
            <button onClick={onQr} role="menuitem" className="group flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left hover:bg-ink-3">
              <span aria-hidden className="w-6 shrink-0 text-center text-xl text-mute">
                ▦
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">QR code</span>
                <span className="block truncate font-mono text-xs text-mute">For flyers, screens and stories</span>
              </span>
              <span aria-hidden className="text-xl text-mute transition group-hover:translate-x-0.5 group-hover:text-bone">
                →
              </span>
            </button>
          </li>
          {items.map((i) => (
            <li key={i.title} className="flex items-center">
              <Link
                href={i.href}
                target={i.external ? "_blank" : undefined}
                onClick={onNavigate}
                role="menuitem"
                className="group flex min-w-0 flex-1 items-center gap-4 rounded-xl px-4 py-3.5 hover:bg-ink-3"
              >
                <span aria-hidden className="w-6 shrink-0 text-center text-xl text-mute">
                  {i.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{i.title}</span>
                  <span className="block truncate font-mono text-xs text-mute">{i.sub}</span>
                </span>
                <span aria-hidden className="text-xl text-mute transition group-hover:translate-x-0.5 group-hover:text-bone">
                  {i.external ? "↗" : "→"}
                </span>
              </Link>
              {i.copy && (
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(link);
                    toast.show({ message: "Submission link copied" });
                  }}
                  className="mr-2 rounded-md px-2 py-1.5 font-mono text-xs uppercase text-mute hover:bg-ink-3 hover:text-bone"
                >
                  Copy
                </button>
              )}
            </li>
          ))}
        </ul>

        <ul className="border-t border-line">
          {footer.map((f) => (
            <li key={f.label} className="border-b border-line last:border-b-0">
              <Link
                href={f.href}
                target={f.external ? "_blank" : undefined}
                rel={f.external ? "noopener noreferrer" : undefined}
                onClick={onNavigate}
                role="menuitem"
                className="flex items-center justify-between px-6 py-4 hover:bg-ink-3"
              >
                {f.label}
                <span aria-hidden className="text-lg text-mute">
                  ↗
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between border-t border-line px-6 py-4">
          <form action={logout}>
            <button role="menuitem" className="font-mono text-sm uppercase tracking-wide hover:text-lime">
              Sign out
            </button>
          </form>
          <span className="font-mono text-xs text-mute">FloorTest v{version}</span>
        </div>
      </div>
    </Panel>
  );
}

function QrDialog({ handle, link, onClose }: { handle: string; link: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  const src = `/api/qr/${handle}`;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-h"
        className="w-full max-w-sm rounded-2xl border border-line bg-ink-2 p-6 shadow-2xl shadow-black/70"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="qr-h" className="text-lg font-semibold">
              Your link as a QR code
            </h2>
            <p className="mt-1 font-mono text-xs text-mute">{link.replace(/^https?:\/\//, "")}</p>
          </div>
          <button ref={close} onClick={onClose} aria-label="Close" className="text-xl leading-none text-mute hover:text-bone">
            ×
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`QR code linking to ${link}`} className="mt-5 aspect-square w-full rounded-xl bg-white" />
        <div className="mt-5 grid grid-cols-2 gap-2">
          <a href={`${src}?format=png&download=1`} className="btn-lime btn-sm">
            Download PNG
          </a>
          <a href={`${src}?format=svg&download=1`} className="btn-ghost btn-sm">
            Download SVG
          </a>
        </div>
        <p className="mt-3 text-sm text-mute">PNG for stories and screens. SVG stays sharp at any size for print.</p>
      </div>
    </div>
  );
}

function Notifications({ items, unread, onNavigate }: { items: Notice[]; unread: number; onNavigate: () => void }) {
  const [, start] = useTransition();
  // Opening the bell marks everything as seen; the dots stay until the next visit.
  useEffect(() => {
    if (unread) start(() => markNotificationsRead());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Panel>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <p className="font-semibold">
          Notifications {unread > 0 && <span className="ml-1 font-mono text-xs uppercase text-lime">{unread} new</span>}
        </p>
        <Link href="/dashboard/notifications" onClick={onNavigate} className="text-sm text-mute underline-offset-4 hover:text-bone hover:underline">
          Email settings
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-mute">Nothing yet. New submissions show up here.</p>
      ) : (
        <ul>
          {items.map((n) => (
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
    </Panel>
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
