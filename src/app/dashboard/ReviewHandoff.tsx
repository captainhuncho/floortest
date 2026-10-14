"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * What a decision hands to the panel that opens next: which way the next track comes in (touch and tap only;
 * keyboard decisions never animate) and where focus lands (the next track's title, or "All caught up."). Set just
 * before the route changes and read once by the panel that mounts. One review page at a time, so module state.
 */
export const handoff: {
  enter: { id: number; dir: "keep" | "pass" } | null;
  focus: number | "caught-up" | null;
  /** Decided just now, save not yet reflected in the page: not counted as waiting (see DecisionRail). */
  decided: Set<number>;
} = { enter: null, focus: null, decided: new Set() };

/**
 * After every page change, drops a handoff nobody picked up (say, a search that now shows "Nothing matches"), so it
 * can't move focus or animate something later. Rendered last, so the panel and the caught-up state read theirs first.
 */
export function HandoffSweep({ at }: { at: string }) {
  useEffect(() => {
    handoff.enter = null;
    handoff.focus = null;
  }, [at]);
  return null;
}

/** The panel renders a phone and a desktop copy of the top card; only one is on screen. */
export const isShown = (el: Element) => el.getClientRects().length > 0;

/** The literal of --ease-out, for the Web Animations API (which can't read CSS variables). */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

/**
 * The part of the review panel a finger can drag (artwork, title, meta and waveform): the whole long panel stays
 * put. Holds the KEEP / NOT FOR ME stamp. A track that arrives after a swipe or tap enters from the side it came
 * from: from the left after Keep, from the right after Not for me (opacity only with reduced motion).
 */
export function SwipeZone({ trackId, children }: { trackId: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const e = handoff.enter;
    if (!el || !e || e.id !== trackId || !isShown(el)) return;
    handoff.enter = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.style.transition = "none";
    el.style.opacity = "0";
    el.style.transform = reduce ? "" : `translateX(${e.dir === "keep" ? -24 : 24}px)`;
    el.getBoundingClientRect(); // commit the starting frame before the transition
    el.style.transition = reduce ? "opacity 200ms var(--ease-out)" : "transform 200ms var(--ease-out), opacity 200ms var(--ease-out)";
    el.style.opacity = "";
    el.style.transform = "";
    const done = setTimeout(() => {
      if (el.style.transition.includes("opacity")) el.style.transition = "";
    }, 240);
    return () => clearTimeout(done);
  }, [trackId]);
  return (
    <div ref={ref} data-swipe-zone>
      {children}
      <span data-stamp aria-hidden />
    </div>
  );
}

/** WCAG 2.4.3: after a decision, focus moves to the next track's title (or the caught-up heading), not the page body. */
// Runs after every render, and takes the handoff only once its target is on screen: on phones "All caught up." can
// render hidden behind the open track first, then show when the address drops the track.
export function ArrivalFocus({ target }: { target: number | "caught-up" }) {
  useEffect(() => {
    if (handoff.focus !== target) return;
    const sel = target === "caught-up" ? "[data-caught-up]" : `[data-track-title="${target}"]`;
    const el = [...document.querySelectorAll<HTMLElement>(sel)].find(isShown);
    if (!el) return;
    handoff.focus = null;
    el.focus();
  });
  return null;
}
