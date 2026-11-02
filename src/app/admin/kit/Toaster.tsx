"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { announceOps, OPS_RESULT_EVENT, type OpsResult, type OpsToastDetail } from "@/lib/ops-result";
import { heldLeft, heldSeconds, HELD_SENT_MS, HELD_SHOWN_MS, TOAST_ERROR_MS, TOAST_MAX, TOAST_MS } from "./core";
import { announce, isField } from "./live";

/** `held`: the action held an email on the server; its token lets Undo stop it. `sent`: that window has closed. */
type Item = { id: number; text: string; tone: "ok" | "error"; undo?: () => unknown; held?: { token: string; at: number }; sent?: boolean };
type Flash = { id: number; text: string; tone: "ok" | "error" } | null;

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
let seq = 0;
const UNDO_FAILED: OpsResult = { ok: false, error: "Undo didn't reach the server, so the email may have gone. Check the Email log." };

/**
 * The ops toasts (ops kit, built on the admin Toast it replaces): a flash from an action not converted yet, and every
 * result an OpsForm, OpsButton or ConfirmButton announces. Up to three stack; hovering or focusing them pauses them all.
 * A result with `undo` gets an Undo button and ⌘Z / Ctrl+Z (outside fields). A result with an `undoToken` (a held send,
 * src/lib/ops-undo.ts) reads "Sending in 5 s · Undo" and counts down; Undo asks the server (`onUndoHeld`, undoSend) and
 * shows its answer, "Not sent" or "Too late: it was sent"; when the count ends it says "Sent" and closes. The count is
 * honest: a pause never keeps Undo past the server's hold (kit/core.ts heldLeft). Each toast is a status (an alert for
 * errors), so it is read out once; the countdown and "Sent" are visual only. The newest is glass; older ones go solid,
 * so the stack never adds blur layers.
 */
export function Toaster({ flash, onUndoHeld }: { flash: Flash; onUndoHeld?: (token: string) => Promise<OpsResult> }) {
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

  const undoHeld = useRef(onUndoHeld);
  useEffect(() => {
    undoHeld.current = onUndoHeld;
  });

  useEffect(() => {
    const show = (e: Event) => {
      const d = (e as CustomEvent<OpsToastDetail>).detail;
      const id = ++seq;
      const token = d.ok && undoHeld.current ? d.undoToken : undefined;
      // A held send's Undo goes to the server; its answer comes back as a toast of its own (and the page refreshes).
      const undo = token
        ? async () => announceOps(await undoHeld.current!(token).catch(() => UNDO_FAILED))
        : d.ok
          ? d.undo
          : undefined;
      const item: Item = d.ok ? { id, text: d.message, tone: "ok", undo, held: token ? { token, at: Date.now() } : undefined } : { id, text: d.error, tone: "error" };
      // A fourth closes the oldest (a held send still goes: the server holds it, not the toast).
      itemsRef.current = [...itemsRef.current, item].slice(-TOAST_MAX); // two results in one moment both stay
      setItems(itemsRef.current);
    };
    window.addEventListener(OPS_RESULT_EVENT, show);
    return () => window.removeEventListener(OPS_RESULT_EVENT, show);
  }, []);

  // A held send's window has closed: no more Undo (nor ⌘Z), and it says "Sent".
  const expire = useCallback((id: number) => {
    itemsRef.current = itemsRef.current.map((x) => (x.id === id ? { ...x, undo: undefined, sent: true } : x));
    setItems(itemsRef.current);
  }, []);

  const runUndo = useCallback(
    (t: Item) => {
      t.undo?.();
      remove(t.id);
      // A held send's answer is its own toast; anything else is undone in the browser at once.
      if (!t.held) announce("Undone");
    },
    [remove],
  );

  // ⌘Z / Ctrl+Z undoes the newest toast that can be undone; inside a field it stays the field's own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z" || e.shiftKey || !(e.metaKey || e.ctrlKey) || isField(e.target)) return;
      const t = [...itemsRef.current].reverse().find((x) => x.undo);
      if (!t) return;
      e.preventDefault();
      runUndo(t);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [runUndo]);

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
        <ToastItem key={t.id} item={t} paused={paused} newest={i === items.length - 1} onClose={() => remove(t.id)} onUndo={() => runUndo(t)} onExpire={() => expire(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ item, paused, newest, onClose, onUndo, onExpire }: { item: Item; paused: boolean; newest: boolean; onClose: () => void; onUndo: () => void; onExpire: () => void }) {
  const closeRef = useRef(onClose);
  const expireRef = useRef(onExpire);
  useEffect(() => {
    closeRef.current = onClose;
    expireRef.current = onExpire;
  });
  const holding = !!item.held && !item.sent;
  const left = useHeldCount(holding ? item.held!.at : null, paused, () => expireRef.current());
  useToastTimer(holding ? null : item.sent ? HELD_SENT_MS : item.tone === "error" ? TOAST_ERROR_MS : TOAST_MS, paused && !item.sent, () => closeRef.current());
  const mac = isMac();
  const keys = item.undo ? `. Press ${mac ? "Command" : "Control"} Z to undo.` : "";
  return (
    <div role={item.tone === "error" ? "alert" : "status"} data-tone={item.tone} data-held={item.held ? (item.sent ? "sent" : "holding") : undefined} className={`kit-toast kit-floating ${newest ? "kit-glass" : ""}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${item.tone === "error" ? "bg-danger" : "bg-lime"}`} />
      <span className="kit-toast-text">
        {item.text}
        {item.held ? (
          <>
            {/* Read once, as it arrives; the seconds ticking down and the later "Sent" are for the eye only. */}
            <span className="sr-only">{`. Sending in ${HELD_SHOWN_MS / 1000} seconds${keys}`}</span>
            <span className="kit-toast-count" aria-hidden>
              {item.sent ? " · Sent" : ` · Sending in ${heldSeconds(left)} s`}
            </span>
          </>
        ) : (
          keys && <span className="sr-only">{keys}</span>
        )}
      </span>
      {item.undo && (
        <button type="button" className="kit-undo" aria-keyshortcuts={mac ? "Meta+Z" : "Control+Z"} onClick={onUndo}>
          Undo <kbd aria-hidden className="kit-kbd">{mac ? "⌘Z" : "Ctrl+Z"}</kbd>
        </button>
      )}
      <button type="button" aria-label="Dismiss" className="kit-x" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

/** Closes a toast after `ms` on screen, not counting time paused; null: no timer (a held send counts itself). */
function useToastTimer(ms: number | null, paused: boolean, done: () => void) {
  const leftRef = useRef(ms);
  const doneRef = useRef(done);
  useEffect(() => {
    doneRef.current = done;
  });
  useEffect(() => {
    leftRef.current = ms;
  }, [ms]);
  useEffect(() => {
    if (paused || leftRef.current === null) return;
    const started = Date.now();
    const base = leftRef.current;
    const end = setTimeout(() => doneRef.current(), base);
    return () => {
      clearTimeout(end);
      leftRef.current = Math.max(0, base - (Date.now() - started));
    };
  }, [paused, ms]);
}

/**
 * A held send's countdown (kit/core.ts heldLeft): ms left to undo, ticking while on screen. Pauses add up, and the
 * server's hold still caps them; at 0 `onEnd` runs once.
 */
function useHeldCount(at: number | null, paused: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(HELD_SHOWN_MS);
  const pausedMs = useRef(0);
  const pausedSince = useRef<number | null>(null);
  const endRef = useRef(onEnd);
  useEffect(() => {
    endRef.current = onEnd;
  });
  useEffect(() => {
    if (paused) pausedSince.current ??= Date.now();
    else if (pausedSince.current !== null) {
      pausedMs.current += Date.now() - pausedSince.current;
      pausedSince.current = null;
    }
  }, [paused]);
  useEffect(() => {
    if (at === null) return;
    const tick = () => {
      const t = Date.now();
      const l = heldLeft(at, t, pausedMs.current + (pausedSince.current === null ? 0 : t - pausedSince.current));
      setLeft(l);
      if (l <= 0) {
        clearInterval(timer);
        endRef.current();
      }
    };
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [at]);
  return left;
}
