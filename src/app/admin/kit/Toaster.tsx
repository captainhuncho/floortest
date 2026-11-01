"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OPS_RESULT_EVENT, type OpsToastDetail } from "@/lib/ops-result";
import { TOAST_ERROR_MS, TOAST_MAX, TOAST_MS } from "./core";
import { announce, isField } from "./live";

type Item = { id: number; text: string; tone: "ok" | "error"; undo?: () => unknown; commit?: () => unknown; sendIn?: number };
type Flash = { id: number; text: string; tone: "ok" | "error" } | null;

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
let seq = 0;

/**
 * The ops toasts (ops kit, built on the admin Toast it replaces): a flash from an action not converted yet, and every
 * result an OpsForm or OpsButton announces. Up to three stack; hovering or focusing them pauses them all. A result
 * with `undo` gets an Undo button and ⌘Z / Ctrl+Z (outside fields); one with `sendIn` counts down "Sending in 5 s" and
 * only then calls `commit`. Each toast is a status (an alert for errors), so it is read out once; the countdown is
 * visual only. The newest is glass; older ones go solid, so the stack never adds blur layers.
 */
export function Toaster({ flash }: { flash: Flash }) {
  const [items, setItems] = useState<Item[]>(() => (flash ? [{ id: ++seq, text: flash.text, tone: flash.tone }] : []));
  const [paused, setPaused] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLElement | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // A new flash (the page re-rendered after an old-style action) joins the stack.
  const [lastFlash, setLastFlash] = useState(flash?.id);
  if (lastFlash !== flash?.id) {
    setLastFlash(flash?.id);
    if (flash) setItems((xs) => [...xs, { id: ++seq, text: flash.text, tone: flash.tone }].slice(-TOAST_MAX));
  }
  useEffect(() => {
    if (flash) document.cookie = "ft_flash=; Max-Age=0; path=/admin";
  }, [flash?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    // Closing the toast you were on puts you back where you were.
    if (box.current?.contains(document.activeElement) && back.current?.isConnected) back.current.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const show = (e: Event) => {
      const d = (e as CustomEvent<OpsToastDetail>).detail;
      const item: Item = d.ok ? { id: ++seq, text: d.message, tone: "ok", undo: d.undo, commit: d.commit, sendIn: d.sendIn } : { id: ++seq, text: d.error, tone: "error" };
      const next = [...itemsRef.current, item];
      // A fourth closes the oldest; a held send that is pushed out goes ahead, as if its window closed.
      for (const old of next.slice(0, Math.max(0, next.length - TOAST_MAX))) old.commit?.();
      itemsRef.current = next.slice(-TOAST_MAX); // two results in one moment both stay
      setItems(itemsRef.current);
    };
    window.addEventListener(OPS_RESULT_EVENT, show);
    return () => window.removeEventListener(OPS_RESULT_EVENT, show);
  }, []);

  // ⌘Z / Ctrl+Z undoes the newest toast that can be undone; inside a field it stays the field's own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z" || e.shiftKey || !(e.metaKey || e.ctrlKey) || isField(e.target)) return;
      const t = [...itemsRef.current].reverse().find((x) => x.undo);
      if (!t) return;
      e.preventDefault();
      t.undo?.();
      remove(t.id);
      announce("Undone");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [remove]);

  const resume = () =>
    setTimeout(() => {
      if (!box.current?.matches(":hover") && !box.current?.contains(document.activeElement)) setPaused(false);
    }, 0);

  return (
    <div
      ref={box}
      role="region"
      aria-label="Notifications"
      className="kit-toasts"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={resume}
      onFocus={(e) => {
        if (e.relatedTarget instanceof HTMLElement && !box.current?.contains(e.relatedTarget)) back.current = e.relatedTarget;
        setPaused(true);
      }}
      onBlur={resume}
    >
      {items.map((t, i) => (
        <ToastItem key={t.id} item={t} paused={paused} newest={i === items.length - 1} onClose={(how) => (how === "commit" && t.commit?.(), remove(t.id))} onUndo={() => (t.undo?.(), remove(t.id), announce("Undone"))} />
      ))}
    </div>
  );
}

function ToastItem({ item, paused, newest, onClose, onUndo }: { item: Item; paused: boolean; newest: boolean; onClose: (how: "commit" | "dismiss") => void; onUndo: () => void }) {
  const total = item.sendIn ? Math.max(1, Math.round(item.sendIn)) * 1000 : item.tone === "error" ? TOAST_ERROR_MS : TOAST_MS;
  const [left, setLeft] = useState(total);
  const leftRef = useRef(total);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const base = leftRef.current;
    const end = setTimeout(() => closeRef.current("commit"), base);
    // Only a held send shows seconds; the others need no ticking at all.
    const tick = item.sendIn
      ? setInterval(() => {
          leftRef.current = Math.max(0, base - (Date.now() - started));
          setLeft(leftRef.current);
        }, 250)
      : undefined;
    return () => {
      clearTimeout(end);
      clearInterval(tick);
      leftRef.current = Math.max(0, base - (Date.now() - started));
    };
  }, [paused, item.sendIn]);
  const mac = isMac();
  return (
    <div role={item.tone === "error" ? "alert" : "status"} data-tone={item.tone} className={`kit-toast kit-floating ${newest ? "kit-glass" : ""}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${item.tone === "error" ? "bg-danger" : "bg-lime"}`} />
      <span className="kit-toast-text">
        {item.text}
        {item.sendIn ? <span className="kit-toast-count" aria-hidden>{` · Sending in ${Math.ceil(left / 1000)} s`}</span> : null}
        {item.undo && <span className="sr-only">{`. Press ${mac ? "Command" : "Control"} Z to undo.`}</span>}
      </span>
      {item.undo && (
        <button type="button" className="kit-undo" aria-keyshortcuts={mac ? "Meta+Z" : "Control+Z"} onClick={onUndo}>
          Undo <kbd aria-hidden className="kit-kbd">{mac ? "⌘Z" : "Ctrl+Z"}</kbd>
        </button>
      )}
      <button type="button" aria-label="Dismiss" className="kit-x" onClick={() => onClose(item.sendIn ? "commit" : "dismiss")}>
        ✕
      </button>
    </div>
  );
}
