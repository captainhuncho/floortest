"use client";

import { useState, useTransition } from "react";
import { Dialog, DIALOG_MAIN, DIALOG_QUIET } from "@/components/Dialog";
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
  const [failed, setFailed] = useState(false);
  const toast = useToast();

  const n = `${count} track${count === 1 ? "" : "s"}`;
  const close = () => {
    setOpen(false);
    setFailed(false);
  };

  return (
    <>
      <button type="button" className={`${GHOST_BTN} disabled:opacity-40`} disabled={!count} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {/* It shares a row with Files only: the short label where that row is narrow. */}
        <span className="sm:hidden">New batch</span>
        <span className="hidden sm:inline">Start a new batch</span>
      </button>
      <Dialog
        open={open}
        onClose={close}
        busy={pending}
        title="Start a new batch?"
        description={
          <>
            Prepare empties so your next keeps start fresh. The {n} {count === 1 ? "stays" : "stay"} Kept in the Review Queue and {count === 1 ? "its collection" : "their collections"}.
            Download {count === 1 ? "it" : "them"} first if you still need {count === 1 ? "it" : "them"} for a set.
          </>
        }
        actions={
          <>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download, not a page */}
            <a href="/api/export?files=1" className={`${DIALOG_QUIET} sm:mr-auto`}>
              Download files first
            </a>
            <button type="button" className={DIALOG_QUIET} disabled={pending} onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              className={DIALOG_MAIN}
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
                  toast.show({ message: `New batch started. The ${n} ${count === 1 ? "is" : "are"} still Kept.` });
                })
              }
            >
              {pending ? "Starting…" : "Start new batch"}
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
