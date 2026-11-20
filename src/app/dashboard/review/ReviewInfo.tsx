"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Dialog } from "@/components/Dialog";
import { stored, useDeviceState } from "@/components/useBrowserValue";
import { CARD } from "@/components/Kit";

export type InfoTab = "track" | "sender";

const OPEN_KEY = "ft:review-info";
const TAB_KEY = "ft:review-info-tab";
const DESKTOP = "(min-width: 1024px)";
const LABEL = "Track and sender info";
const TABS: { id: InfoTab; label: string }[] = [
  { id: "track", label: "Track" },
  { id: "sender", label: "Sender" },
];

type Info = {
  /** True while Info is on screen: the sheet under 1024px, the drawer from there. */
  expanded: boolean;
  toggle: () => void;
  /** Opens Info on a tab; `then` is a control inside it to press or focus once it is there (the private note). */
  show: (tab: InfoTab, then?: string) => void;
};

const InfoContext = createContext<Info | null>(null);

/** Info for the open track's card. Null outside a review card. */
export const useReviewInfo = () => useContext(InfoContext);

const watchDesktop = (onChange: () => void) => {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const isDesktop = () => window.matchMedia(DESKTOP).matches;

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/**
 * Review card option 1 (owner, 20 Nov: "go with option 1"): the track's facts and the sender's record sit behind the
 * card's Info button, so the card never grows. Under 1024px Info is a bottom sheet (the shared Dialog: Escape, a tap
 * outside or its close button shuts it, and focus goes back to the button). From 1024px it is a 320px drawer beside
 * the card, not a modal: the card stays usable and K and X still decide. The drawer remembers open or closed and its
 * last tab on this device; the sheet always opens on Track.
 */
export function ReviewInfo({ track, sender, children }: { track: React.ReactNode; sender: React.ReactNode; children: React.ReactNode }) {
  const desktop = useSyncExternalStore(watchDesktop, isDesktop, () => false);
  const [drawer, setDrawer] = useDeviceState(() => stored(OPEN_KEY) === "1", false);
  const [savedTab, setSavedTab] = useDeviceState<InfoTab>(() => (stored(TAB_KEY) === "sender" ? "sender" : "track"), "track");
  const [sheet, setSheet] = useState(false);
  const [sheetTab, setSheetTab] = useState<InfoTab>("track");
  // A control to go to once Info is showing it.
  const [then, setThen] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const id = useId();

  const tab = desktop ? savedTab : sheetTab;
  const expanded = desktop ? drawer : sheet;

  const pickTab = useCallback(
    (next: InfoTab) => {
      if (!isDesktop()) return setSheetTab(next);
      setSavedTab(next);
      save(TAB_KEY, next);
    },
    [setSavedTab],
  );
  const openDrawer = useCallback(
    (on: boolean) => {
      setDrawer(on);
      save(OPEN_KEY, on ? "1" : "0");
    },
    [setDrawer],
  );

  const info = useMemo<Info>(
    () => ({
      expanded,
      toggle: () => {
        if (isDesktop()) return openDrawer(!drawer);
        if (!sheet) setSheetTab("track");
        setSheet(!sheet);
      },
      show: (next, target) => {
        pickTab(next);
        if (isDesktop()) openDrawer(true);
        else setSheet(true);
        setThen(target ?? null);
      },
    }),
    [expanded, drawer, sheet, openDrawer, pickTab],
  );

  // Once the tab asked for is on screen, go to the control inside it: an opener (data-more) is pressed and the cursor
  // goes to its field; anything else takes focus.
  useEffect(() => {
    if (!then || !expanded) return;
    const frame = requestAnimationFrame(() => {
      const el = body.current?.querySelector<HTMLElement>(then);
      setThen(null);
      if (!el) return;
      if (!el.dataset.more) return el.focus();
      const around = el.parentElement;
      el.click();
      requestAnimationFrame(() => around?.querySelector<HTMLElement>("input, textarea")?.focus());
    });
    return () => cancelAnimationFrame(frame);
  }, [then, expanded, tab]);

  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.id === tab);
    const to = e.key === "ArrowRight" ? (at + 1) % TABS.length : e.key === "ArrowLeft" ? (at + TABS.length - 1) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    pickTab(TABS[to].id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus();
  };

  const content = (
    <div ref={body} data-review-info className="flex flex-col gap-3">
      <div role="tablist" aria-label={LABEL} onKeyDown={onTabKey} className="flex gap-[3px] rounded-[11px] bg-well p-[3px]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${id}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${id}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => pickTab(t.id)}
            className={`min-h-11 flex-1 rounded-[9px] text-[13px] font-semibold ${tab === t.id ? "bg-line text-bone" : "text-mute hover:text-bone"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div key={t.id} role="tabpanel" id={`${id}-panel-${t.id}`} aria-labelledby={`${id}-tab-${t.id}`} hidden={tab !== t.id}>
          {t.id === "track" ? track : sender}
        </div>
      ))}
    </div>
  );

  return (
    <InfoContext.Provider value={info}>
      <div className="lg:flex lg:items-start lg:gap-4">
        <div className="min-w-0 lg:flex-1">{children}</div>
        {desktop && drawer && (
          <aside aria-label={LABEL} data-info-drawer className={`${CARD} hidden w-80 shrink-0 p-4 lg:block`}>
            {content}
          </aside>
        )}
      </div>
      {/* The sheet's title is for screen readers; the tabs say what it holds. */}
      <Dialog open={sheet && !desktop} onClose={() => setSheet(false)} title={<span className="sr-only">{LABEL}</span>}>
        {sheet && !desktop && content}
      </Dialog>
    </InfoContext.Provider>
  );
}

/** The card's Info button (ⓘ), beside More: 44px or more, says whether Info is open. */
export function InfoButton({ className }: { className: string }) {
  const info = useReviewInfo();
  if (!info) return null;
  return (
    <button type="button" onClick={info.toggle} aria-expanded={info.expanded} aria-label={LABEL} data-info-button className={className}>
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5.5" />
        <path d="M12 7.6v.1" />
      </svg>
    </button>
  );
}
