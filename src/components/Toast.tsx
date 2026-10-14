"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Toast = { id: number; message: string; action?: { label: string; run: () => void | Promise<void> } };
type Ctx = { show: (t: Omit<Toast, "id">) => void; undoLatest: () => boolean };

const ToastContext = createContext<Ctx | null>(null);
export const useToast = () => {
  const c = useContext(ToastContext);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
};

const TTL = 7000;
/** With an action (Undo), longer: there's something to read and decide. */
const TTL_ACTION = 10_000;
/** Matches the exit fade in globals.css ([data-toast][data-leaving]). */
const EXIT_MS = 150;

type Hold = { hover: boolean; focus: boolean; touch: boolean };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  // The latest undoable action outlives the toast, so U still works after it fades.
  const lastAction = useRef<Toast["action"]>(undefined);
  // Auto-dismiss pauses while the pointer, a finger or keyboard focus is on the toast, and picks up where it left off.
  const remaining = useRef(0);
  const deadline = useRef(0);
  const hold = useRef<Hold>({ hover: false, focus: false, touch: false });
  const leavingRef = useRef(false);

  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const dismiss = useCallback(() => {
    stopTimer();
    leavingRef.current = true;
    setLeaving(true);
    if (exit.current) clearTimeout(exit.current);
    exit.current = setTimeout(() => {
      leavingRef.current = false;
      setToast(null);
      setLeaving(false);
    }, EXIT_MS);
  }, []);

  const run = useCallback(
    (ms: number) => {
      stopTimer();
      remaining.current = ms;
      deadline.current = Date.now() + ms;
      timer.current = setTimeout(dismiss, ms);
    },
    [dismiss],
  );

  const pause = (why: keyof Hold) => {
    hold.current[why] = true;
    if (!timer.current) return;
    stopTimer();
    remaining.current = Math.max(0, deadline.current - Date.now());
  };
  const resume = (why: keyof Hold) => {
    hold.current[why] = false;
    const h = hold.current;
    if (h.hover || h.focus || h.touch || timer.current || leavingRef.current) return;
    run(Math.max(1500, remaining.current));
  };

  const show = useCallback(
    (t: Omit<Toast, "id">) => {
      if (exit.current) clearTimeout(exit.current);
      leavingRef.current = false;
      setLeaving(false);
      if (t.action) lastAction.current = t.action;
      setToast({ ...t, id: ++seq.current });
      const h = hold.current;
      // Already under the pointer or focus (a second toast while reading the first): stay paused.
      if (h.hover || h.focus || h.touch) {
        stopTimer();
        remaining.current = t.action ? TTL_ACTION : TTL;
      } else run(t.action ? TTL_ACTION : TTL);
    },
    [run],
  );

  const undoLatest = useCallback(() => {
    const action = lastAction.current;
    if (!action) return false;
    lastAction.current = undefined;
    void action.run();
    show({ message: "Undone" });
    return true;
  }, [show]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (exit.current) clearTimeout(exit.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ show, undoLatest }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
        {toast && (
          // One stable element: a new message swaps its text in place instead of replaying the entrance.
          <div
            data-toast
            data-leaving={leaving ? "" : undefined}
            onMouseEnter={() => pause("hover")}
            onMouseLeave={() => resume("hover")}
            onFocus={() => pause("focus")}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resume("focus");
            }}
            onTouchStart={() => pause("touch")}
            onTouchEnd={() => resume("touch")}
            onTouchCancel={() => resume("touch")}
            className="pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-bone py-0.5 pl-4 pr-0.5 text-sm text-ink shadow-pop"
          >
            <span className="py-2.5">{toast.message}</span>
            {toast.action && (
              <button
                className="min-h-11 rounded-md px-2 font-semibold underline underline-offset-4 hover:bg-ink/10"
                onClick={() => {
                  lastAction.current = undefined;
                  void toast.action!.run();
                  dismiss();
                }}
              >
                {toast.action.label} <span className="font-normal text-ink/60">(U)</span>
              </button>
            )}
            <button onClick={dismiss} aria-label="Dismiss" className="grid size-11 shrink-0 place-items-center rounded-md text-lg text-ink/60 hover:text-ink">
              ×
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
