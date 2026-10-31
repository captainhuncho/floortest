"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IDLE, OFFER_MS, WHEEL_IDLE_MS, reducePull, restingAtTop, type PullEvent, type PullState } from "@/lib/pull-refresh";

/** Never starts on these: fields, open sheets and dialogs, the player, the batch bar, sliders (waveform scrubbing). */
const NEVER = [
  "input", "textarea", "select", '[contenteditable]:not([contenteditable="false"])',
  "dialog", '[role="dialog"]', '[aria-modal="true"]', "[data-sheet]", '[role="listbox"]', '[role="menu"]', '[role="slider"]',
  "[data-batch-bar]", "[data-player-bar]", "[data-mini-player]", "[data-tabbar]", "[data-toast]", "[data-no-pull]",
].join(",");
/** A mouse press on a control or a link is a click, not a pull (touch can still pull from over them, as on iOS). */
const NOT_FOR_MOUSE = `${NEVER},button,a,label,summary,[role="button"],[role="tab"],[role="switch"],[role="checkbox"],[draggable="true"],video,audio`;
/** Anything open on top of the page switches it off: dialogs, sheets, the ⌘K panel, menus and drop-downs. */
const OPEN = 'dialog[open], [aria-modal="true"], [data-sheet], [aria-haspopup][aria-expanded="true"], [data-no-pull]';
const FIELD = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="search"]), textarea';

const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0;

/** The page's own scroller: the desk's #main from md up (it scrolls inside), otherwise the window. */
function scrollerFor(target: Element): Element {
  const main = target.closest("#main") ?? document.getElementById("main");
  if (main && /(auto|scroll)/.test(getComputedStyle(main).overflowY)) return main;
  return document.scrollingElement ?? document.documentElement;
}

/** Every scrollable box between the target and the page scroller is at its top too (a scrolled list never pulls). */
function atTop(target: Element, scroller: Element) {
  for (let el: Element | null = target; el && el !== scroller; el = el.parentElement) {
    if (el.scrollTop > 0) return false;
  }
  return scroller.scrollTop <= 0 && window.scrollY <= 0;
}

/** What stretches: the page's main column, never a box holding the fixed player or tab bar. */
export function stretchTarget(): HTMLElement | null {
  const main = document.getElementById("main") ?? document.querySelector("main");
  if (main) return main as HTMLElement;
  return Array.from(document.body.children).find((el) => el instanceof HTMLElement && getComputedStyle(el).position === "static" && visible(el)) as HTMLElement | null;
}

/** A mouse press on words selects them; only a press on empty page pulls. */
function overText(x: number, y: number) {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let node: Node | null = null, offset = 0;
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) [node, offset] = [p.offsetNode, p.offset];
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) [node, offset] = [r.startContainer, r.startOffset];
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return false;
  const range = document.createRange();
  for (const at of [offset - 1, offset]) {
    if (at < 0 || at >= node.textContent.length) continue;
    range.setStart(node, at);
    range.setEnd(node, at + 1);
    const b = range.getBoundingClientRect();
    if (x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2) return true;
  }
  return false;
}

/** The iOS app has its own native pull to refresh (mobile/ios SceneDelegate.swift), so the page's stays out of its way. */
function nativeHasRefresh() {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios";
}

/**
 * Wires the page's touch, mouse and wheel events to the pull-to-refresh rules (src/lib/pull-refresh.ts). Off while
 * anything sits open on top of the page, while a password is typed, and while a field holds typed, unsaved words.
 */
export function usePullToRefresh(path: string) {
  const [state, setState] = useState<PullState>(IDLE);
  const ref = useRef<PullState>(IDLE);
  const send = useCallback((e: PullEvent) => {
    const next = reducePull(ref.current, e);
    if (next !== ref.current) {
      ref.current = next;
      setState(next);
    }
    return next;
  }, []);

  // A new page starts fresh.
  useEffect(() => {
    if (ref.current.phase !== "refreshing") send({ type: "cancel" });
  }, [path, send]);

  useEffect(() => {
    if (nativeHasRefresh()) return;
    let lastScroll = 0, lastWheel = 0, wheelTimer = 0;
    // Fields as they were when first touched: typed and unsaved means the pull stays off.
    const before = new Map<Element, string>();
    const now = () => performance.now();
    const dirty = () => {
      for (const [el, v] of before) {
        if (!el.isConnected) before.delete(el);
        else if ((el as HTMLInputElement).value !== v) return true;
      }
      return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]')).some((el) => el.value !== "");
    };
    const enabled = () => !Array.from(document.querySelectorAll(OPEN)).some(visible) && !document.body.classList.contains("site-editing") && !dirty();
    const ready = (target: EventTarget | null, never: string) => {
      if (!(target instanceof Element) || target.closest(never) || !enabled()) return false;
      return atTop(target, scrollerFor(target)) && restingAtTop(0, now(), lastScroll);
    };
    let scroller: Element | null = null, origin: Element | null = null;
    const top = () => !!origin && !!scroller && atTop(origin, scroller);

    const onScroll = () => void (lastScroll = now());
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof Element && e.target.matches(FIELD) && !before.has(e.target)) before.set(e.target, (e.target as HTMLInputElement).value);
    };
    // A form that sends saves what was typed.
    const onSubmit = () => before.clear();

    const begin = (target: EventTarget | null, source: "touch" | "mouse", x: number, y: number, never: string) => {
      const ok = ready(target, never);
      origin = ok ? (target as Element) : null;
      scroller = ok ? scrollerFor(target as Element) : null;
      send({ type: "start", source, x, y, ready: ok });
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return void send({ type: "cancel" });
      begin(e.target, "touch", e.touches[0].clientX, e.touches[0].clientY, NEVER);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (ref.current.source !== "touch" || ref.current.phase === "idle") return;
      if (e.touches.length !== 1) return void send({ type: "cancel" });
      const s = send({ type: "move", x: e.touches[0].clientX, y: e.touches[0].clientY, atTop: top() });
      // Only once it's really a pull: stops the browser's own bounce and pull to refresh doubling up.
      if ((s.phase === "pulling" || s.phase === "armed") && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = () => ref.current.source === "touch" && send({ type: "end" });
    const onTouchCancel = () => ref.current.source === "touch" && send({ type: "cancel" });

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || ref.current.phase === "offer") return;
      if (overText(e.clientX, e.clientY)) return void send({ type: "cancel" });
      begin(e.target, "mouse", e.clientX, e.clientY, NOT_FOR_MOUSE);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || ref.current.source !== "mouse" || ref.current.phase === "idle") return;
      const s = send({ type: "move", x: e.clientX, y: e.clientY, atTop: top() });
      if (s.phase === "pulling" || s.phase === "armed") window.getSelection()?.removeAllRanges(); // a pull, not a selection
    };
    const onPointerUp = (e: PointerEvent) => e.pointerType === "mouse" && ref.current.source === "mouse" && send({ type: "end" });
    const onPointerCancel = (e: PointerEvent) => e.pointerType === "mouse" && ref.current.source === "mouse" && send({ type: "cancel" });

    const onWheel = (e: WheelEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      const fresh = now() - lastWheel > WHEEL_IDLE_MS;
      lastWheel = now();
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => send({ type: "wheelIdle" }), WHEEL_IDLE_MS);
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // sideways
      // Never while a drop-down, field or list is in use: scrolling its list must scroll the list.
      const active = document.activeElement;
      const busy = !t || !!t.closest(NEVER) || (!!active && /^(SELECT|INPUT|TEXTAREA)$/.test(active.tagName));
      if (fresh && ref.current.phase === "idle") {
        origin = t;
        scroller = t ? scrollerFor(t) : null;
      }
      send({ type: "wheel", deltaY: e.deltaY, fresh, ready: !busy && ready(t, NEVER), atTop: top() });
    };

    const passive = { passive: true } as const;
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("focusin", onFocus);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("touchstart", onTouchStart, passive);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, passive);
    document.addEventListener("touchcancel", onTouchCancel, passive);
    document.addEventListener("pointerdown", onPointerDown, passive);
    document.addEventListener("pointermove", onPointerMove, passive);
    document.addEventListener("pointerup", onPointerUp, passive);
    document.addEventListener("pointercancel", onPointerCancel, passive);
    document.addEventListener("wheel", onWheel, passive);
    return () => {
      window.clearTimeout(wheelTimer);
      document.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("wheel", onWheel);
    };
  }, [send]);

  // The trackpad's button goes away by itself.
  useEffect(() => {
    if (state.phase !== "offer") return;
    const t = window.setTimeout(() => send({ type: "offerTimeout" }), OFFER_MS);
    return () => window.clearTimeout(t);
  }, [state.phase, send]);

  return { state, send };
}
