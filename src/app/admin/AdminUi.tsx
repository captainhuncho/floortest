"use client";

import { useEffect, useRef, useState, useTransition } from "react";

/** Shows the latest admin flash for a few seconds, then clears it so a reload doesn't repeat it. */
export function Toast({ flash }: { flash: { id: number; text: string; tone: "ok" | "error" } | null }) {
  const [shown, setShown] = useState(flash);
  useEffect(() => {
    setShown(flash);
    if (!flash) return;
    document.cookie = "ft_flash=; Max-Age=0; path=/admin";
    const t = setTimeout(() => setShown(null), flash.tone === "error" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [flash?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {shown && (
        <div
          role={shown.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-[12px] shadow-2xl ${
            shown.tone === "error" ? "border-danger/50 bg-ink-3 text-bone" : "border-lime/40 bg-ink-3 text-bone"
          }`}
        >
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${shown.tone === "error" ? "bg-danger" : "bg-lime"}`} />
          <span className="flex-1">{shown.text}</span>
          <button type="button" onClick={() => setShown(null)} aria-label="Dismiss" className="text-faint hover:text-bone">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/** A confirm pop-up in FloorTest's style, instead of the browser's grey box. */
export function ConfirmButton({
  action,
  message,
  className,
  children,
  confirmLabel = "Confirm",
  danger = false,
}: {
  action: () => Promise<void>;
  message: string;
  className?: string;
  children: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const destructive = danger || /delete|remove|erase|suspend|can't be undone/i.test(message);
  return (
    <>
      <button type="button" className={className} disabled={pending} onClick={() => ref.current?.showModal()}>
        {pending ? "Working…" : children}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-ink-2 p-0 text-bone backdrop:bg-black/70"
      >
        <div className="space-y-5 p-5">
          <p className="text-[13px] leading-[1.6]">{message}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => ref.current?.close()}>
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              className={destructive ? "btn-sm rounded-md bg-danger px-4 font-bold text-ink" : "btn-lime btn-sm"}
              onClick={() => {
                ref.current?.close();
                start(() => action());
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
