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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  // The latest undoable action outlives the toast, so U still works after it fades.
  const lastAction = useRef<Toast["action"]>(undefined);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback(
    (t: Omit<Toast, "id">) => {
      if (timer.current) clearTimeout(timer.current);
      if (t.action) lastAction.current = t.action;
      setToast({ ...t, id: ++seq.current });
      timer.current = setTimeout(dismiss, TTL);
    },
    [dismiss],
  );

  const undoLatest = useCallback(() => {
    const action = lastAction.current;
    if (!action) return false;
    lastAction.current = undefined;
    void action.run();
    show({ message: "Undone" });
    return true;
  }, [show]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <ToastContext.Provider value={{ show, undoLatest }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
        {toast && (
          <div
            key={toast.id}
            data-toast
            className="pointer-events-auto flex items-center gap-4 rounded-lg border border-line bg-bone px-4 py-3 text-sm text-ink shadow-2xl shadow-black/60"
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                className="rounded-md px-2 py-1 font-semibold underline underline-offset-4 hover:bg-ink/10"
                onClick={() => {
                  lastAction.current = undefined;
                  void toast.action!.run();
                  dismiss();
                }}
              >
                {toast.action.label} <span className="font-normal text-ink/60">(U)</span>
              </button>
            )}
            <button onClick={dismiss} aria-label="Dismiss" className="text-ink/60 hover:text-ink">
              ×
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
