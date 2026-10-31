"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Short messages after something happened: "Saved", "Link copied", or that it didn't work and what to do. One calm card
 * per message, bottom centre, above the tab bar, mini player and batch bar (globals.css "Toasts"), never over them.
 *
 * - `tone`: "done" (default) for something that worked, "error" for something that didn't. An error stays longer.
 * - `action`: one button, usually Undo. Undoable by default (U runs the latest one); `undoable: false` for one that isn't.
 * - Up to three stack, newest at the bottom; the same message again refreshes the one on screen instead of adding another.
 * - A polite live region: screen readers hear each message once, without interrupting.
 * - Auto-dismiss pauses while the pointer, a finger or keyboard focus is on a message, and picks up where it left off.
 */
type Action = { label: string; run: () => void | Promise<void>; undoable?: boolean };
type Tone = "done" | "error";
type Toast = { id: number; message: string; tone: Tone; action?: Action; leaving?: boolean };
type ShowArgs = { message: string; tone?: Tone; action?: Action };
type Ctx = { show: (t: ShowArgs) => void; undoLatest: () => boolean };

const ToastContext = createContext<Ctx | null>(null);
export const useToast = () => {
  const c = useContext(ToastContext);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
};

const TTL = 6000;
/** With an action (Undo) or after a failure: longer, there's something to read and decide. */
const TTL_LONG = 10_000;
/** Matches the exit fade in globals.css ([data-toast][data-leaving]). */
const EXIT_MS = 150;
const MAX = 3;

type Hold = { hover: boolean; focus: boolean; touch: boolean };
type Clock = { timer: ReturnType<typeof setTimeout> | null; remaining: number; deadline: number };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // The list lives in a ref too, so show() and the timers work from the current list without side effects in an updater.
  const list = useRef<Toast[]>([]);
  const commit = useCallback((next: Toast[]) => {
    list.current = next;
    setToasts(next);
  }, []);
  const seq = useRef(0);
  const clocks = useRef(new Map<number, Clock>());
  // The latest undoable action outlives its toast, so U still works after it fades.
  const lastAction = useRef<Action | undefined>(undefined);
  const hold = useRef<Hold>({ hover: false, focus: false, touch: false });
  const held = () => hold.current.hover || hold.current.focus || hold.current.touch;

  const remove = useCallback((id: number) => {
    const c = clocks.current.get(id);
    if (c?.timer) clearTimeout(c.timer);
    clocks.current.delete(id);
    if (!list.current.some((t) => t.id === id && !t.leaving)) return;
    commit(list.current.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => commit(list.current.filter((t) => t.id !== id)), EXIT_MS);
  }, [commit]);

  const runClock = useCallback(
    (id: number, ms: number) => {
      const old = clocks.current.get(id);
      if (old?.timer) clearTimeout(old.timer);
      clocks.current.set(id, { timer: setTimeout(() => remove(id), ms), remaining: ms, deadline: Date.now() + ms });
    },
    [remove],
  );

  const pause = (why: keyof Hold) => {
    hold.current[why] = true;
    for (const c of clocks.current.values()) {
      if (!c.timer) continue;
      clearTimeout(c.timer);
      c.timer = null;
      c.remaining = Math.max(0, c.deadline - Date.now());
    }
  };
  const resume = (why: keyof Hold) => {
    hold.current[why] = false;
    if (held()) return;
    for (const [id, c] of clocks.current) if (!c.timer) runClock(id, Math.max(1500, c.remaining));
  };

  const show = useCallback(
    ({ message, tone = "done", action }: ShowArgs) => {
      if (action && action.undoable !== false) lastAction.current = action;
      const ttl = action || tone === "error" ? TTL_LONG : TTL;
      const live = list.current.filter((t) => !t.leaving);
      const same = live.find((t) => t.message === message && t.tone === tone);
      const id = same?.id ?? ++seq.current;
      if (same) commit(list.current.map((t) => (t.id === id ? { ...t, action } : t)));
      else {
        for (const t of live.slice(0, Math.max(0, live.length + 1 - MAX))) remove(t.id);
        commit([...list.current, { id, message, tone, action }]);
      }
      // Already under the pointer or focus: stay paused, with the full time left once it's let go.
      if (held()) {
        const old = clocks.current.get(id);
        if (old?.timer) clearTimeout(old.timer);
        clocks.current.set(id, { timer: null, remaining: ttl, deadline: 0 });
      } else runClock(id, ttl);
    },
    [runClock, remove, commit],
  );

  const undoLatest = useCallback(() => {
    const action = lastAction.current;
    if (!action) return false;
    lastAction.current = undefined;
    void action.run();
    show({ message: "Undone" });
    return true;
  }, [show]);

  useEffect(() => {
    const all = clocks.current;
    return () => {
      for (const c of all.values()) if (c.timer) clearTimeout(c.timer);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show, undoLatest }}>
      {children}
      <div
        aria-live="polite"
        aria-label="Messages"
        role="region"
        data-toast-region
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        onMouseEnter={() => pause("hover")}
        onMouseLeave={() => resume("hover")}
        onFocus={() => pause("focus")}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resume("focus");
        }}
        onTouchStart={() => pause("touch")}
        onTouchEnd={() => resume("touch")}
        onTouchCancel={() => resume("touch")}
      >
        {toasts.map((t) => (
          <ToastCard
            key={t.id}
            toast={t}
            onAction={() => {
              if (t.action && t.action.undoable !== false) lastAction.current = undefined;
              void t.action?.run();
              remove(t.id);
            }}
            onDismiss={() => remove(t.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onAction, onDismiss }: { toast: Toast; onAction: () => void; onDismiss: () => void }) {
  const error = toast.tone === "error";
  return (
    <div
      data-toast
      data-tone={toast.tone}
      data-leaving={toast.leaving ? "" : undefined}
      className="pointer-events-auto flex w-full max-w-[26rem] items-center gap-2.5 rounded-card border border-line-2 bg-ink-2 py-1 pl-3.5 pr-1 text-[13px] leading-5 text-bone shadow-pop"
    >
      <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full ${error ? "bg-danger/15 text-danger" : "bg-ink-4 text-bone"}`}>
        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          {error ? <path d="M12 7v6M12 17h.01" /> : <path d="M6.5 12.5l3.5 3.5 7.5-8" />}
        </svg>
      </span>
      <p className="min-w-0 flex-1 py-2.5 [overflow-wrap:anywhere]">
        {error && <span className="sr-only">Didn&apos;t work: </span>}
        {toast.message}
      </p>
      {toast.action && (
        <button type="button" className="min-h-11 shrink-0 rounded-control px-2.5 text-[13px] font-semibold text-bone underline underline-offset-4 hover:bg-ink-4" onClick={onAction}>
          {toast.action.label}
          {toast.action.undoable !== false && <span className="font-normal text-faint max-md:hidden"> (U)</span>}
        </button>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="grid size-11 shrink-0 place-items-center rounded-control text-faint hover:bg-ink-4 hover:text-bone">
        <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M7 7l10 10M17 7 7 17" />
        </svg>
      </button>
    </div>
  );
}
