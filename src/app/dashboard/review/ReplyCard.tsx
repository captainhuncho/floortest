"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Dialog, DIALOG_MAIN, DIALOG_QUIET } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import type { ReplyResult } from "../actions/review";
import { QuickReplies } from "../QuickReplies";
import { ReplyTemplates } from "../ReplyTemplates";

/**
 * "Reply to …" as a layer over the Queue (Design option 42): a sheet on phones, a centred panel on laptops. The Reply
 * button and R open it with the cursor in the box; Escape or Cancel closes it and keeps what was typed. Nothing is sent
 * until Send reply.
 */
export function ReplyPanel({ open, onClose, senderName, onReply }: { open: boolean; onClose: () => void; senderName: string; onReply: (fd: FormData) => Promise<ReplyResult> }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  // A refused reply (a limit) says why here: a toast would sit under the panel.
  const [refused, setRefused] = useState<string | null>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();

  const fill = (text: string) => {
    if (replyRef.current) replyRef.current.value = text;
    replyRef.current?.focus();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      wide
      title={`Reply to ${senderName}`}
      description={`Emailed to ${senderName} from FloorTest. Nothing is sent until you press Send reply.`}
      actions={
        <>
          <button type="button" className={DIALOG_QUIET} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form={formId} className={DIALOG_MAIN} disabled={busy}>
            {busy ? "Sending…" : "Send reply"}
          </button>
        </>
      }
    >
      <form
        id={formId}
        ref={formRef}
        data-reply
        className="flex flex-col gap-2.5"
        // A plain submit, not a form action: React clears a form after its action, and a refused reply keeps its text.
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setRefused(null);
          start(async () => {
            // Says what really happened; a refused reply keeps its text so nothing typed is lost.
            const r = await onReply(fd);
            if (r.status === "refused") return setRefused(r.message);
            formRef.current?.reset();
            onClose();
            toast.show({ message: r.message, tone: "done" });
          });
        }}
      >
        <QuickReplies senderName={senderName} onPick={fill} />
        <label htmlFor="reply-body" className="sr-only">
          Your reply to {senderName}
        </label>
        <textarea
          id="reply-body"
          ref={replyRef}
          name="body"
          required
          maxLength={4000}
          data-autofocus
          className="input min-h-28 resize-y rounded-xl! bg-well! max-sm:text-base sm:text-[13px]"
          placeholder="Your own words, or start from a quick reply"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) formRef.current?.requestSubmit();
          }}
        />
        {refused && (
          <p role="alert" className="text-[12.5px] text-danger">
            {refused}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <ReplyTemplates onPick={fill} current={() => replyRef.current?.value ?? ""} />
          <span className="hidden text-[11px] text-faint [@media(pointer:fine)]:inline">⌘/Ctrl + Enter to send</span>
        </div>
      </form>
    </Dialog>
  );
}
