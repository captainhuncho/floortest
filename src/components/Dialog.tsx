"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";

/**
 * The one pop-up shell (owner, 31 Oct: every pop-up smooth and the same). A native modal `<dialog>`: the browser keeps
 * focus inside and the page behind inert, Escape closes it, and focus goes back to whatever opened it. A bottom sheet on
 * phones (safe area respected), a centred box from 640px; it rises or scales in, and only fades with reduced motion
 * (globals.css "Dialogs"). Tapping the dimmed page closes it, unless it's busy.
 *
 * Content: a title, an optional line under it, the body, and the actions in a footer. On phones the actions stack
 * full width with the main one on top; on wider screens they sit right-aligned in a row.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  wide = false,
  busy = false,
  closeLabel = "Close",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** The buttons, main one last (it shows on the right on wide screens and on top on phones). */
  actions?: React.ReactNode;
  wide?: boolean;
  /** While true, Escape and the backdrop don't close it (an action is running). */
  busy?: boolean;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const titleId = useId();
  const descId = useId();
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // Unmounted while open (a page change): put focus back too.
  useEffect(() => () => void (opener.current?.isConnected && opener.current.focus()), []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-wide={wide ? "" : undefined}
      className="ft-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busyRef.current) onClose();
      }}
      onClose={() => {
        if (open) onClose();
        const o = opener.current;
        opener.current = null;
        if (o?.isConnected) o.focus();
      }}
      // A click on the dialog element itself (not its panel) is a click on the dimmed page around it.
      onClick={(e) => {
        if (e.target === ref.current && !busyRef.current) onClose();
      }}
    >
      <div className="ft-dialog-panel">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1 pt-2.5">
            <h2 id={titleId} className="text-[17px] font-semibold leading-6 tracking-[-0.02em] text-bone">
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-1.5 text-[13px] leading-5 text-mute">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label={closeLabel}
            disabled={busy}
            className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-faint hover:bg-ink-4 hover:text-bone disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M7 7l10 10M17 7 7 17" />
            </svg>
          </button>
        </header>
        {children && <div className="mt-4 text-[13px] leading-5 text-bone">{children}</div>}
        {actions && <footer className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">{actions}</footer>}
      </div>
    </dialog>
  );
}

/** Dialog buttons: full width and 48px on phones, the app's regular size from 640px. */
export const DIALOG_BTN = "inline-flex min-h-12 items-center justify-center rounded-control px-4 text-[14px] font-semibold sm:min-h-10 sm:text-[13px] disabled:opacity-50";
export const DIALOG_QUIET = `${DIALOG_BTN} border border-line bg-ink-3 text-bone hover:border-line-2`;
export const DIALOG_MAIN = `${DIALOG_BTN} bg-lime text-[#10110f] hover:bg-[#e2ff7a]`;
export const DIALOG_DANGER = `${DIALOG_BTN} bg-danger text-on-danger hover:opacity-90`;

export type ConfirmOptions = {
  /** The question, e.g. "Remove @lena?". */
  title: React.ReactNode;
  /** What happens, in a sentence or two: what changes, what stays, whether it can be undone. */
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive: the final yes is solid red and Cancel gets the focus. */
  danger?: boolean;
};

/**
 * Asks before doing something. `onConfirm` runs inside the dialog: the button shows it's working, and if it throws,
 * the dialog stays open and says so instead of failing silently.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
}: ConfirmOptions & { open: boolean; onClose: () => void; onConfirm: () => unknown }) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const close = () => {
    setFailed(false);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      busy={pending}
      title={title}
      description={body}
      actions={
        <>
          <button type="button" autoFocus={danger} className={DIALOG_QUIET} disabled={pending} onClick={close}>
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus={!danger}
            className={danger ? DIALOG_DANGER : DIALOG_MAIN}
            disabled={pending}
            onClick={() =>
              start(async () => {
                setFailed(false);
                try {
                  await onConfirm();
                  close();
                } catch (e) {
                  // A redirect or not-found from a server action is Next's own signal, not a failure.
                  if (isNextSignal(e)) throw e;
                  setFailed(true);
                }
              })
            }
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      {failed && (
        <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-bone">
          That didn&apos;t go through, so nothing changed. Check your connection and try again.
        </p>
      )}
    </Dialog>
  );
}

/**
 * The app's replacement for `window.confirm()`: `const [ask, confirmDialog] = useConfirm()`, render `confirmDialog`
 * once, then `if (await ask({ title, body, confirmLabel, danger })) …`. Resolves false on Cancel, Escape or a tap outside.
 */
export function useConfirm() {
  const [req, setReq] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
  };
  const ask = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setReq(o);
        setOpen(true);
      }),
    [],
  );
  const node = req ? (
    <ConfirmDialog
      open={open}
      {...req}
      onConfirm={() => settle(true)}
      onClose={() => {
        settle(false);
        setOpen(false);
      }}
    />
  ) : null;
  return [ask, node] as const;
}

/** A message split into its question and the rest: "Delete this file? The slot returns." → title + body. */
export function splitQuestion(message: string): { title: string; body?: string } {
  const i = message.indexOf("?");
  if (i < 0 || i === message.length - 1) return { title: message };
  return { title: message.slice(0, i + 1), body: message.slice(i + 1).trim() || undefined };
}

function isNextSignal(e: unknown) {
  return typeof e === "object" && e !== null && "digest" in e && /^NEXT_/.test(String((e as { digest: unknown }).digest));
}
