"use client";

import { useCallback, useRef, useState } from "react";
import { Dialog, DIALOG_DANGER, DIALOG_MAIN, DIALOG_QUIET } from "@/components/Dialog";
import { namesShown } from "./core";

export type KitConfirmOptions = {
  title: string;
  body?: React.ReactNode;
  /** Who it affects, shown by name: the first eight, then "and N more". */
  names?: string[];
  /** Asks for a reason first (it goes in their email and the admin log); the button stays off until there is one. */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  confirmLabel?: string;
  danger?: boolean;
};

/**
 * The ops kit's one confirm, on the app's Dialog (src/components/Dialog.tsx): it names the people it affects, can ask
 * for a reason, and starts on Cancel, so Enter right after opening it never does the thing. It is for what can't be
 * undone; anything reversible gets an Undo in the toast instead.
 *
 * `const [ask, confirmNode] = useKitConfirm()`; render `confirmNode` once; `const r = await ask({...})` resolves to
 * `{ reason }` on yes and null on Cancel, Escape or a tap outside.
 */
export function useKitConfirm() {
  const [req, setReq] = useState<KitConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const resolver = useRef<((r: { reason: string } | null) => void) | null>(null);
  const settle = (r: { reason: string } | null) => {
    resolver.current?.(r);
    resolver.current = null;
    setOpen(false);
  };
  const ask = useCallback(
    (o: KitConfirmOptions) =>
      new Promise<{ reason: string } | null>((resolve) => {
        resolver.current?.(null);
        resolver.current = resolve;
        setReason("");
        setReq(o);
        setOpen(true);
      }),
    [],
  );
  const { shown, more } = namesShown(req?.names ?? []);
  const missing = !!req?.requireReason && !reason.trim();
  const node = req ? (
    <Dialog
      open={open}
      onClose={() => settle(null)}
      title={req.title}
      description={req.body}
      actions={
        <>
          <button type="button" data-autofocus className={DIALOG_QUIET} onClick={() => settle(null)}>
            Cancel
          </button>
          <button type="button" className={req.danger ? DIALOG_DANGER : DIALOG_MAIN} disabled={missing} onClick={() => !missing && settle({ reason: reason.trim() })}>
            {req.confirmLabel ?? "Confirm"}
          </button>
        </>
      }
    >
      {shown.length > 0 && (
        <ul aria-label="Affects" className="max-h-44 list-disc overflow-y-auto rounded-control bg-ink-3 py-2 pl-7 pr-3 text-[13px] leading-6 ring-1 ring-line">
          {shown.map((n, i) => (
            <li key={`${i}-${n}`}>{n}</li>
          ))}
          {more > 0 && <li>and {more} more</li>}
        </ul>
      )}
      {req.requireReason && (
        <label className="mt-4 block space-y-1.5">
          <span className="label">{req.reasonLabel ?? "Reason (they see this)"}</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} required aria-required placeholder={req.reasonPlaceholder ?? "e.g. spam uploads"} className="input w-full" />
        </label>
      )}
    </Dialog>
  ) : null;
  return [ask, node] as const;
}
