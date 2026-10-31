"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stored, useDeviceState } from "@/components/useBrowserValue";

/** How long the pointer rests on the rail before it opens, and how long it may wander off before it folds (no flicker). */
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 300;
/** "Pin menu open", remembered on this device (not "Keep …": the Queue's e2e finds its Keep button by /^Keep/). */
const PIN_KEY = "ft-rail-pinned";

/**
 * The desk menu's open state on desktop (owner, 31 Oct): folded to an icon rail, it opens while a mouse rests on it,
 * while keyboard focus is inside it, or after a tap on the Menu button (touch screens, which can't hover); the page
 * makes room for it. Pinned, it stays open. `path` closes a tap-opened rail once a link is followed.
 */
export function useRail(path: string) {
  const [pinned, setPinnedState] = useDeviceState(() => stored(PIN_KEY) === "1", false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [tapOpenOn, setTapOpenOn] = useState<string | null>(null);
  const tapOpen = tapOpenOn === path;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  const close = useCallback(() => {
    clearTimer();
    setHover(false);
    setFocus(false);
    setTapOpenOn(null);
  }, []);

  const expanded = pinned || hover || focus || tapOpen;

  // A tap outside, or Escape, folds it again (pinned stays open: that's the person's choice).
  useEffect(() => {
    if (!expanded || pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [expanded, pinned, close]);

  const setPinned = (on: boolean) => {
    setPinnedState(on);
    try {
      if (on) localStorage.setItem(PIN_KEY, "1");
      else localStorage.removeItem(PIN_KEY);
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
  };

  // Only a real mouse or pen hovers; a finger's emulated hover would open it on every tap.
  const panelProps = {
    ref: panel,
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      clearTimer();
      timer.current = setTimeout(() => setHover(true), OPEN_DELAY_MS);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      clearTimer();
      timer.current = setTimeout(() => setHover(false), CLOSE_DELAY_MS);
    },
    // Keyboard focus opens it; a mouse click's focus doesn't, or it would stay open after the pointer leaves.
    onFocus: (e: React.FocusEvent) => {
      if ((e.target as HTMLElement).matches?.(":focus-visible")) setFocus(true);
    },
    onBlur: (e: React.FocusEvent) => {
      if (!panel.current?.contains(e.relatedTarget as Node | null)) setFocus(false);
    },
  };

  const toggleTap = () => (tapOpen ? close() : setTapOpenOn(path));

  return { expanded, pinned, setPinned, tapOpen, toggleTap, panelProps };
}
