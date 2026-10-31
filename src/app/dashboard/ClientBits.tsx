"use client";

import { useRef, useState, useTransition } from "react";
import { ConfirmDialog, splitQuestion } from "@/components/Dialog";
import { SEG, segTab } from "@/components/Kit";
import { QuickReplies } from "./QuickReplies";
import type { ReplyResult } from "./actions/review";

/**
 * A button that asks first, in the app's own dialog (never the browser's grey box). `message` is the question and what
 * happens, e.g. "Delete this file now? The slot returns." The part up to the "?" becomes the dialog's title.
 */
export function ConfirmButton({
  action,
  message,
  className,
  children,
  confirmLabel,
  danger,
}: {
  action: () => Promise<void>;
  message: string;
  className?: string;
  children: React.ReactNode;
  confirmLabel?: string;
  /** Destructive: solid red final yes. Guessed from the words when not given. */
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { title, body } = splitQuestion(message);
  const destructive = danger ?? /\b(delete|remove|block|revoke|erase|can't be undone)/i.test(message);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {children}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={action}
        title={title}
        body={body}
        danger={destructive}
        confirmLabel={confirmLabel ?? (typeof children === "string" ? children : "Confirm")}
      />
    </>
  );
}

/** Private note about a sender. Never sent anywhere. */
export function NoteForm({ onNote }: { onNote: (fd: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  if (!open)
    return (
      <button className="btn-ghost btn-sm mt-4" onClick={() => setOpen(true)}>
        + Private note
      </button>
    );
  return (
    <form
      ref={ref}
      className="mt-4"
      action={(fd) =>
        start(async () => {
          await onNote(fd);
          ref.current?.reset();
          setOpen(false);
        })
      }
    >
      <label className="label mb-1.5 block" htmlFor="note-body">
        Private note, never sent to the sender
      </label>
      <textarea id="note-body" name="body" required maxLength={4000} autoFocus className="input min-h-20 resize-y" />
      <div className="mt-2 flex gap-2">
        <button className="btn-ghost btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </button>
        <button type="button" className="btn btn-sm text-mute" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Contact composer: reply by email, or keep a private note. */
export function Composer({
  senderName,
  onNote,
  onReply,
}: {
  senderName: string;
  onNote: (fd: FormData) => Promise<void>;
  onReply: (fd: FormData) => Promise<ReplyResult>;
}) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  // What happened to the last reply (sent, waiting for approval, already sent, or not sent and why).
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  return (
    <form
      ref={ref}
      // A plain submit, not a form action: React clears a form after its action, and a refused reply must keep its text.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setNotice("");
          if (mode === "note") await onNote(fd);
          else {
            const r = await onReply(fd);
            setNotice(r.message);
            if (r.status === "refused") return; // keep the text to try again
          }
          ref.current?.reset();
        });
      }}
    >
      <div className={SEG} role="tablist">
        {(["reply", "note"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`${segTab(mode === m)} pointer-coarse:min-h-11`}
          >
            {m === "reply" ? `Email ${senderName}` : "Private note"}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="composer">
        {mode === "reply" ? `Message to ${senderName}` : "Private note"}
      </label>
      <textarea
        id="composer"
        ref={area}
        name="body"
        required
        maxLength={4000}
        className="input mt-2 min-h-24 resize-y"
        placeholder={mode === "note" ? "Private: the sender never sees this." : `Sent to ${senderName} by email.`}
      />
      {mode === "reply" && (
        <div className="mt-2">
          <QuickReplies
            senderName={senderName}
            onPick={(t) => {
              if (area.current) area.current.value = t;
              area.current?.focus();
            }}
          />
        </div>
      )}
      <button className="btn-lime mt-2 min-h-11 rounded-[13px]" disabled={pending}>
        {pending ? "Saving…" : mode === "note" ? "Save note" : "Send email"}
      </button>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-[13px] text-mute">
        {mode === "reply" ? notice : ""}
      </p>
    </form>
  );
}
