"use client";

import { usePathname } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { IconBox, SEG, segTab } from "@/components/Kit";
import { useToast } from "@/components/Toast";
import { sendFeedback } from "./actions/desk";

/** Beta feedback from anywhere in the dashboard, with the page it came from. Goes to the admin inbox. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("Idea");
  const [pending, start] = useTransition();
  const text = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const path = usePathname();
  const toast = useToast();

  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        // Escape closes the panel and puts focus back on the button.
        if (e.key === "Escape" && open) {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[13px] border border-line bg-card px-3 text-[13px] font-semibold text-bone transition-colors hover:border-line-2 aria-expanded:bg-well"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Feedback"
      >
        {/* Phones: an icon, so the header row fits. */}
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        <span className="hidden sm:inline">Feedback</span>
      </button>
      {open && (
        <form
          className="absolute right-0 top-full z-50 mt-3 w-[min(20rem,calc(100vw-2rem))] space-y-3 rounded-[18px] border border-line bg-card p-3 text-bone shadow-pop"
          onSubmit={(e) => {
            e.preventDefault();
            const message = text.current?.value.trim() ?? "";
            if (!message) return;
            start(async () => {
              await sendFeedback(kind, message, path);
              setOpen(false);
              toast.show({ message: "Thanks. It went straight to the FloorTest team." });
            });
          }}
        >
          <div className="flex items-center gap-2">
            <IconBox name="reply" small />
            <p className="text-[15px] font-semibold tracking-[-0.015em]">Help shape FloorTest</p>
          </div>
          <div className={`${SEG} w-full`} role="radiogroup" aria-label="Type">
            {["Idea", "Bug", "Confusing", "Love it"].map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`${segTab(kind === k)} flex-1 px-1.5! pointer-coarse:min-h-11`}
              >
                {k}
              </button>
            ))}
          </div>
          <textarea ref={text} required maxLength={3000} className="input min-h-24 resize-y rounded-xl! bg-well! max-sm:text-base sm:text-[13px]" placeholder="What happened, or what would make this better?" aria-label="Feedback" />
          <div className="flex items-center gap-2">
            <button className="btn-lime min-h-11 rounded-[13px] px-4! text-[13px]! font-semibold" disabled={pending}>
              {pending ? "Sending…" : "Send"}
            </button>
            <button type="button" className="inline-flex min-h-10 items-center rounded-[11px] border border-line bg-well px-3 text-[13px] font-semibold text-bone transition-colors hover:border-line-2 pointer-coarse:min-h-11" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <span className="ml-auto text-[11.5px] text-mute">Includes this page</span>
          </div>
        </form>
      )}
    </div>
  );
}
