"use client";

import { useEffect, useRef, useTransition } from "react";
import { isTyping } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { Icon, IconBox } from "@/components/Kit";
import type { ReplyResult } from "../actions/review";
import { QuickReplies } from "../QuickReplies";
import { ReplyTemplates } from "../ReplyTemplates";

/**
 * "Reply to …" as its own card under the sender's note (redesign, 30 Oct). The box is always there, so a reply is one
 * tap away on a phone; R jumps into it from anywhere on the page and Esc steps back out, so K and X work again.
 * Nothing is sent until Send.
 */
export function ReplyCard({ senderName, onReply }: { senderName: string; onReply: (fd: FormData) => Promise<ReplyResult> }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) {
        if (e.key === "Escape" && e.target === replyRef.current) replyRef.current?.blur();
        return;
      }
      if (e.key.toLowerCase() !== "r") return;
      e.preventDefault();
      replyRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fill = (text: string) => {
    if (replyRef.current) replyRef.current.value = text;
    replyRef.current?.focus();
  };

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-2.5"
      // A plain submit, not a form action: React clears a form after its action, and a refused reply keeps its text.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          // Says what really happened; a refused reply (a limit) keeps its text so nothing typed is lost.
          const r = await onReply(fd);
          toast.show({ message: r.message });
          if (r.status === "refused") return;
          formRef.current?.reset();
          replyRef.current?.blur();
        });
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <IconBox name="reply" small />
          <label htmlFor="reply-body" className="truncate text-[15px] font-semibold tracking-[-0.015em] text-bone">
            Reply to {senderName}
          </label>
        </div>
        <kbd aria-hidden className="rounded-[5px] border border-current px-1.5 font-mono text-[10px] font-semibold text-mute opacity-70 [@media(pointer:coarse)]:hidden">
          R
        </kbd>
      </div>
      <QuickReplies senderName={senderName} onPick={fill} />
      <textarea
        id="reply-body"
        ref={replyRef}
        name="body"
        required
        maxLength={4000}
        aria-keyshortcuts="R"
        className="input min-h-20 resize-y rounded-xl! bg-well! max-sm:text-base sm:text-[13px]"
        placeholder={`Emailed to ${senderName} from FloorTest. Nothing is sent until you press Send.`}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) formRef.current?.requestSubmit();
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <ReplyTemplates onPick={fill} current={() => replyRef.current?.value ?? ""} />
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            formRef.current?.reset();
            replyRef.current?.blur();
          }}
        >
          Cancel
        </button>
        <span className="hidden text-[11px] text-faint [@media(pointer:fine)]:inline">⌘/Ctrl + Enter to send</span>
        <button className="ml-auto inline-flex min-h-11 items-center sm:min-h-10 gap-1.5 rounded-xl border border-line bg-well px-3.5 text-[13px] font-semibold text-bone transition-colors hover:border-line-2 disabled:opacity-40" disabled={busy}>
          <Icon name="send" className="size-4" />
          {busy ? "Sending…" : "Send reply"}
        </button>
      </div>
    </form>
  );
}
