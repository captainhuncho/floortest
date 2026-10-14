"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isTyping } from "./Player";
import { stored } from "./useBrowserValue";

/**
 * The Queue's single-key shortcuts (K, X, R, U, J, 1–4) can be switched off in Settings → Account, per browser
 * (WCAG 2.1.4: character-key shortcuts can be turned off). On unless this browser saved "off". Space and the arrow
 * keys aren't character keys and stay on.
 */
const KEY = "ft:shortcuts";
const EVENT = "ft:shortcuts";

export const shortcutsOn = () => stored(KEY) !== "off";

export function setShortcutsOn(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Changes in this tab (the event) and in other tabs (storage). */
function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && onChange();
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Whether single-key shortcuts are on in this browser, kept in step across tabs. On during server render. */
export function useShortcutsOn(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, shortcutsOn, () => true);
  return [on, useCallback((v: boolean) => setShortcutsOn(v), [])];
}

const visible = (el: Element) => el.getClientRects().length > 0;

/** A menu, dialog or popover is open: keys belong to it, not to the page behind. */
export function overlayOpen() {
  const open = document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [aria-modal="true"], dialog[open]');
  if ([...open].some(visible)) return true;
  try {
    return document.querySelector(":popover-open") !== null;
  } catch {
    return false;
  }
}

/**
 * Whether a key press may run a page shortcut: no modifier, not typing, nothing floating open, and focus on the page
 * itself or inside the review area (`[data-shortcuts]`), never in the navigation, a menu or another panel.
 */
export function shortcutTarget(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return false;
  if (overlayOpen()) return false;
  const t = e.target;
  if (!(t instanceof Element) || t === document.body || t === document.documentElement) return true;
  return !!t.closest("[data-shortcuts]");
}

/** A single-character shortcut (a letter or digit), the kind the switch turns off. */
export const isCharacterKey = (e: KeyboardEvent) => e.key.length === 1 && /[a-z0-9]/i.test(e.key);
