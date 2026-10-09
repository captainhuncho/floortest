"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { clearKept } from "../actions/review";

/** Clears the current Prepare for set batch, after a clear warning. */
export function ClearKept({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  const n = `${count} kept track${count === 1 ? "" : "s"}`;

  return (
    <>
      <button type="button" className="mx-auto mt-1 block py-1 text-xs font-bold text-danger hover:underline hover:underline-offset-4 disabled:opacity-40" disabled={!count} onClick={() => setOpen(true)}>
        Clear kept
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby="clear-h"
        className="m-auto w-[min(92vw,440px)] rounded-xl border border-line bg-ink-2 p-6 text-bone backdrop:bg-black/70"
      >
        <h2 id="clear-h" className="text-xl font-bold">
          Clear {n}?
        </h2>
        <p className="mt-3 text-mute">
          This empties Prepare for set so your next keeps start a fresh batch. The tracks aren&apos;t deleted: they stay Kept in the Review Queue and in their
          collections.
        </p>
        <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          You can&apos;t undo this. If you still need these files for a set, download them first.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <a href="/api/export?files=1" className="btn-ghost btn-sm mr-auto">
            Download files first
          </a>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-sm rounded-md bg-danger px-4 font-semibold text-ink disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await clearKept();
                setOpen(false);
                toast.show({ message: `Cleared ${n}. Your next keeps start a new batch.` });
              })
            }
          >
            {pending ? "Clearing…" : `Clear ${count}`}
          </button>
        </div>
      </dialog>
    </>
  );
}
