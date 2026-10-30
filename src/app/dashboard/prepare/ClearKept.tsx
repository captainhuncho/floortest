"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { clearKept } from "../actions/review";
import { GHOST_BTN } from "./buttons";

/**
 * "Start a new batch": empties Prepare so the next keeps start fresh, after a confirm. Nothing is deleted or un-kept
 * (the tracks stay Kept in the Review Queue and their collections), so it's a quiet secondary action, not a red one.
 */
export function ClearKept({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  const n = `${count} track${count === 1 ? "" : "s"}`;

  return (
    <>
      <button type="button" className={`${GHOST_BTN} disabled:opacity-40`} disabled={!count} onClick={() => setOpen(true)}>
        {/* It shares a row with Files only: the short label where that row is narrow. */}
        <span className="sm:hidden">New batch</span>
        <span className="hidden sm:inline">Start a new batch</span>
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby="clear-h"
        className="dialog-box m-auto w-[min(92vw,440px)] backdrop:bg-black/70"
      >
        <h2 id="clear-h" className="text-xl font-bold">
          Start a new batch?
        </h2>
        <p className="mt-3 text-mute">
          Prepare empties so your next keeps start fresh. The {n} {count === 1 ? "stays" : "stay"} Kept in the Review Queue and {count === 1 ? "its collection" : "their collections"}.
          Download {count === 1 ? "it" : "them"} first if you still need {count === 1 ? "it" : "them"} for a set.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download, not a page */}
          <a href="/api/export?files=1" className="btn-ghost btn-sm mr-auto">
            Download files first
          </a>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-lime btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await clearKept();
                setOpen(false);
                toast.show({ message: `New batch started. The ${n} ${count === 1 ? "is" : "are"} still Kept.` });
              })
            }
          >
            {pending ? "Starting…" : "Start new batch"}
          </button>
        </div>
      </dialog>
    </>
  );
}
