"use client";

import { usePathname } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { sendFeedback } from "./actions";

/** Beta feedback from anywhere in the dashboard, with the page it came from. Goes to the admin inbox. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("Idea");
  const [pending, start] = useTransition();
  const text = useRef<HTMLTextAreaElement>(null);
  const path = usePathname();
  const toast = useToast();

  return (
    <div className="relative">
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Feedback">
        {/* Phones: an icon, so the header row fits. */}
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        <span className="hidden sm:inline">Feedback</span>
      </button>
      {open && (
        <form
          className="card absolute right-0 top-full z-50 mt-2 w-80 space-y-3 p-4 shadow-2xl shadow-black/50"
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
          <p className="font-medium">Help shape FloorTest</p>
          <div className="flex gap-1" role="radiogroup" aria-label="Type">
            {["Idea", "Bug", "Confusing", "Love it"].map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-md border px-2.5 py-1 text-xs ${kind === k ? "border-lime text-bone" : "border-line text-mute hover:text-bone"}`}
              >
                {k}
              </button>
            ))}
          </div>
          <textarea ref={text} required maxLength={3000} className="input min-h-24 resize-y" placeholder="What happened, or what would make this better?" aria-label="Feedback" />
          <div className="flex items-center gap-2">
            <button className="btn-lime btn-sm" disabled={pending}>
              {pending ? "Sending…" : "Send"}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <span className="ml-auto text-xs text-mute">Includes this page</span>
          </div>
        </form>
      )}
    </div>
  );
}
