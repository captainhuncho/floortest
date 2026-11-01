"use client";

import { usePathname } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { IconBox, SEG, segTab } from "@/components/Kit";
import { useToast } from "@/components/Toast";
import { closeFeedbackAsk, sendFeedback } from "./actions/desk";

const KINDS = ["Idea", "Bug", "Confusing", "Love it"];
const SECONDARY =
  "inline-flex min-h-11 items-center rounded-[11px] border border-line bg-well px-3 text-[13px] font-semibold text-bone transition-colors hover:border-line-2";

/**
 * The feedback form: a kind, a text box and Send. Goes to the admin Feedback page with the page it came from
 * (sendFeedback → lib/feedback) and the window width. `ask` is the one-time ask after a person's 5th decision
 * (FeedbackAsk, lib/feedback-ask): its own question, and Not now (asks once more after 10 decisions) / Don't ask again
 * (closes it for good) instead of Cancel.
 */
export function FeedbackForm({ ask = false, onClose, className = "" }: { ask?: boolean; onClose: () => void; className?: string }) {
  const [kind, setKind] = useState("Idea");
  const [pending, start] = useTransition();
  const text = useRef<HTMLTextAreaElement>(null);
  const path = usePathname();
  const toast = useToast();
  const title = ask ? "How's FloorTest working for you?" : "Help shape FloorTest";
  const dismiss = (choice: "later" | "never") => {
    onClose();
    if (ask) void closeFeedbackAsk(choice).catch(() => {});
  };

  return (
    <form
      data-feedback-panel
      aria-label={title}
      className={`space-y-3 rounded-[18px] border border-line bg-card p-3 text-bone shadow-pop ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        const message = text.current?.value.trim() ?? "";
        if (!message) return;
        start(async () => {
          try {
            await sendFeedback(kind, message, path, ask, window.innerWidth);
          } catch {
            toast.show({ message: "Couldn't send that. Your words are still in the box. Try again.", tone: "error" });
            return;
          }
          onClose();
          toast.show({ message: "Thanks. It went straight to the FloorTest team." });
        });
      }}
    >
      <div className="flex items-center gap-2">
        <IconBox name="reply" small />
        <p className="text-[15px] font-semibold tracking-[-0.015em]">{title}</p>
      </div>
      <div className={`${SEG} w-full`} role="radiogroup" aria-label="Type">
        {KINDS.map((k) => (
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
      <textarea
        ref={text}
        required
        maxLength={3000}
        className="input min-h-24 resize-y rounded-xl! bg-well! max-sm:text-base sm:text-[13px]"
        placeholder="What happened, or what would make this better?"
        aria-label="Feedback"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-lime min-h-11 rounded-[13px] px-4! text-[13px]! font-semibold" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
        {ask ? (
          <>
            <button type="button" className={SECONDARY} onClick={() => dismiss("later")}>
              Not now
            </button>
            <button type="button" className="inline-flex min-h-11 items-center px-1.5 text-[12.5px] font-medium text-mute underline-offset-4 hover:text-bone hover:underline" onClick={() => dismiss("never")}>
              Don&apos;t ask again
            </button>
          </>
        ) : (
          <>
            <button type="button" className={SECONDARY} onClick={onClose}>
              Cancel
            </button>
            <span className="ml-auto text-[11.5px] text-mute">Includes this page</span>
          </>
        )}
      </div>
    </form>
  );
}

const noSubscribe = () => () => {};

/**
 * The Feedback button in the top bar, on every desk page and every screen size (phones get the icon). The panel drops
 * under the bar; it's only ever opened by a tap, never by itself (the one-time ask is FeedbackAsk, in the page).
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // The panel goes to the page body (it can't open before the page is in the browser): the top bar's glass and box
  // would otherwise hold it to their own width.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  return (
    <div
      className="contents"
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
        className="inline-flex size-11 items-center justify-center rounded-[11px] text-[13px] font-semibold text-bone transition-colors hover:bg-well aria-expanded:bg-well sm:w-auto sm:px-3"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Feedback"
      >
        {/* Phones: an icon, so the header row fits at 320px. */}
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        <span className="hidden sm:inline">Feedback</span>
      </button>
      {open &&
        mounted &&
        createPortal(
          // Phones: as wide as the floating top bar, just under it (clear of the notch). From md: under the bar, right.
          <FeedbackForm
            onClose={() => setOpen(false)}
            className="fixed inset-x-3 top-[calc(max(0.5rem,env(safe-area-inset-top))+4rem)] z-50 max-h-[calc(100dvh-10rem)] overflow-y-auto md:left-auto md:right-6 md:top-[4.25rem] md:w-80"
          />,
          document.getElementById("theme-root") ?? document.body,
        )}
    </div>
  );
}

/**
 * The one-time ask after a person's 5th decision (lib/feedback-ask), as a card at the top of the page, in the flow: it
 * never floats over the player, Keep / Not for me or anything else, and takes no focus. It usually turns on while a
 * page is open (a decision refreshes the layout and the 5th brings `due`); any answer closes it for good.
 */
export function FeedbackAsk({ due }: { due: boolean }) {
  const [closed, setClosed] = useState(false);
  if (!due || closed) return null;
  return (
    <div className="px-3 pb-1 md:px-6 md:pt-4">
      <FeedbackForm ask onClose={() => setClosed(true)} className="mx-auto max-w-xl shadow-none!" />
    </div>
  );
}

/** Account → Send feedback: the same form, in place under the row, instead of the public contact page. */
export function SendFeedbackRow({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="group flex min-h-11 w-full items-center gap-2.5 py-2 text-left"
      >
        {children}
      </button>
      {open && <FeedbackForm onClose={() => setOpen(false)} className="mb-2 shadow-none!" />}
    </div>
  );
}
