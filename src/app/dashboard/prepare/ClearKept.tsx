"use client";

import { useState, useTransition } from "react";
import { Dialog, DIALOG_QUIET } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { clearKept } from "../actions/review";

/**
 * "Start a new batch": empties Prepare so the next keeps start fresh, after a confirm. Nothing is deleted or un-kept
 * (the tracks stay Kept, in their callouts, and still count toward the desk), so it's a quiet link and neither button
 * in its sheet is lime (owner, 17 Nov: option 44).
 */
export function ClearKept({ count, className = "" }: { count: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const toast = useToast();

  const one = count === 1;
  const n = `${count} track${one ? "" : "s"}`;
  const close = () => {
    setOpen(false);
    setFailed(false);
  };

  return (
    <>
      <button type="button" className={`inline-flex min-h-11 items-center rounded-[10px] text-[13px] font-medium text-mute underline-offset-4 transition-colors hover:text-bone hover:underline ${className}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        Start a new batch
      </button>
      <Dialog
        open={open}
        onClose={close}
        busy={pending}
        title="Start a new batch?"
        description={
          <>
            Prepare empties. The {n} {one ? "stays" : "stay"} Kept, {one ? "stays in its callout" : "stay in their callouts"} and still {one ? "counts" : "count"} toward your desk. It frees no room.
          </>
        }
        actions={
          <>
            <button type="button" className={DIALOG_QUIET} disabled={pending} onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              data-autofocus
              className={DIALOG_QUIET}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setFailed(false);
                  try {
                    await clearKept();
                  } catch {
                    return setFailed(true);
                  }
                  close();
                  toast.show({ message: `New batch started. The ${n} ${one ? "is" : "are"} still Kept.` });
                })
              }
            >
              {pending ? "Starting…" : "Start a new batch"}
            </button>
          </>
        }
      >
        {failed && (
          <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-bone">
            Prepare wasn&apos;t emptied, so nothing changed. Check your connection and try again.
          </p>
        )}
      </Dialog>
    </>
  );
}
