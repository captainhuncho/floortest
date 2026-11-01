"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { selectRange, toggleOne } from "./core";
import { announce } from "./live";
import { useShortcuts } from "./Keys";

/**
 * Row selection for an ops table (ops kit). Click a row's checkbox to pick it, Shift-click to pick everything from the
 * last one; on the keyboard j/k (or the arrows on a focused row) move, x or Space picks, Shift+J/K extends, ⌘A / Ctrl+A
 * picks all, Esc clears. Never more than `max` (the server's bulk limit). Rows say aria-selected; the table itself gets
 * no aria-multiselectable (not allowed on a plain table: a11y review, B fix 14).
 */
export function useSelection<T>(ids: readonly T[], max = Infinity) {
  const [selected, setSelected] = useState<Set<T>>(() => new Set());
  const [current, setCurrent] = useState(-1);
  const anchor = useRef(0);
  const rows = useRef<(HTMLElement | null)[]>([]);
  const focusWanted = useRef(false);
  const shiftRef = useRef(false);

  // Rows that left the list (a filter, a refresh) leave the selection too.
  const key = ids.join("\u0000");
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setSelected((s) => new Set([...s].filter((id) => ids.includes(id))));
    setCurrent((c) => Math.min(c, ids.length - 1));
  }

  useLayoutEffect(() => {
    if (focusWanted.current && current >= 0) rows.current[current]?.focus({ preventScroll: false });
    focusWanted.current = false;
  }, [current]);

  const moveTo = (i: number, extend: boolean) => {
    if (!ids.length) return;
    const next = Math.max(0, Math.min(ids.length - 1, i));
    // The anchor is read now: the update below runs later, after the anchor may have moved.
    const from = anchor.current;
    if (extend) setSelected((s) => selectRange(s, ids, from, next, true, max));
    else anchor.current = next;
    focusWanted.current = true;
    setCurrent(next);
  };
  const toggleAt = (i: number, extend: boolean) => {
    if (i < 0 || i >= ids.length) return;
    const from = anchor.current;
    setSelected((s) => (extend ? selectRange(s, ids, from, i, true, max) : toggleOne(s, ids[i], max)));
    anchor.current = i;
    setCurrent(i);
  };
  const clear = () => setSelected(new Set());
  const selectAll = () => setSelected(new Set(ids.slice(0, Number.isFinite(max) ? max : undefined)));

  const at = () => (current >= 0 ? current : -1);
  useShortcuts({
    j: { label: "Next row", run: () => moveTo(at() + 1, false) },
    k: { label: "Previous row", run: () => moveTo(Math.max(0, at() - 1), false) },
    J: { label: "Extend the selection down", run: () => moveTo(at() + 1, true) },
    K: { label: "Extend the selection up", run: () => moveTo(Math.max(0, at() - 1), true) },
    x: { label: "Select or clear the current row", run: () => toggleAt(Math.max(0, at()), false) },
    escape: { label: "Clear the selection", run: clear },
  });

  return {
    selected,
    count: selected.size,
    current,
    isSelected: (id: T) => selected.has(id),
    clear,
    selectAll,
    allSelected: ids.length > 0 && ids.slice(0, Number.isFinite(max) ? max : undefined).every((id) => selected.has(id)),
    /**
     * For the row's checkbox. Shift is read when the press starts (pointer or key), because the click a label passes
     * on to its checkbox doesn't always carry it; the change then picks a range or one row.
     */
    checkboxProps: (i: number) => ({
      checked: selected.has(ids[i]),
      onKeyDown: (e: React.KeyboardEvent) => void (shiftRef.current = e.shiftKey),
      onChange: () => {
        const on = !selected.has(ids[i]);
        const from = anchor.current;
        if (shiftRef.current) setSelected((s) => selectRange(s, ids, from, i, on, max));
        else setSelected((s) => toggleOne(s, ids[i], max));
        shiftRef.current = false;
        anchor.current = i;
        setCurrent(i);
      },
    }),
    /** For the checkbox's label (its tap target): notes Shift for a press anywhere on it, the box included. */
    pressProps: { onPointerDown: (e: React.PointerEvent) => void (shiftRef.current = e.shiftKey) },
    /** For the row itself: roving focus, aria-selected, and the keys that only make sense on a focused row. */
    rowProps: (i: number) => ({
      ref: (el: HTMLElement | null) => {
        rows.current[i] = el;
      },
      tabIndex: i === Math.max(0, current) ? 0 : -1,
      "aria-selected": selected.has(ids[i]),
      "data-current": i === current || undefined,
      onFocus: (e: React.FocusEvent) => {
        if (e.target === e.currentTarget) setCurrent(i);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.target !== e.currentTarget || e.altKey) return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          selectAll();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          moveTo(i + (e.key === "ArrowDown" ? 1 : -1), e.shiftKey);
        } else if (e.key === " ") {
          e.preventDefault();
          toggleAt(i, e.shiftKey);
        }
      },
    }),
  };
}

/** Says "3 selected" once each time the count changes (the bar's own count is visual). */
export function useSelectionAnnounce(count: number) {
  const last = useRef(0);
  useEffect(() => {
    if (count && count !== last.current) announce(`${count} selected`);
    else if (!count && last.current) announce("Selection cleared");
    last.current = count;
  }, [count]);
}
