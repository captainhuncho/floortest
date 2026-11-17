"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useBrowserValue } from "@/components/useBrowserValue";
import { pauseLink, resumeLink } from "../../actions/desk";
import { FIELD_LABEL, GHOST } from "../../kitButtons";
import { ROW, RowText } from "./rows";

export type PauseFacts = { on: boolean; until: string | null; untilTs: number | null; message: string };

/** A timestamp as YYYY-MM-DD in this browser's time zone, or "" for none. */
function localDate(ts: number | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * "Pause your link": the switch is on while the link is paused, and flips at once (it undoes itself, with a message,
 * if the server says no). While paused, the note senders see and the return date open under the row.
 */
export function PauseRow({ pause }: { pause: PauseFacts }) {
  const [paused, setPaused] = useState(pause.on);
  const [busy, start] = useTransition();
  const toast = useToast();
  // Follow the server once it confirms (or if it changes elsewhere).
  const [serverOn, setServerOn] = useState(pause.on);
  if (serverOn !== pause.on) {
    setServerOn(pause.on);
    setPaused(pause.on);
  }
  // The return date in the browser's own calendar; a date the person picks stays until the server's changes.
  const saved = useBrowserValue(() => localDate(pause.untilTs), "");
  const [picked, setPicked] = useState<{ for: number | null; value: string } | null>(null);
  const until = picked && picked.for === pause.untilTs ? picked.value : saved;

  const flip = () => {
    const next = !paused;
    setPaused(next);
    start(async () => {
      try {
        if (next) {
          const fd = new FormData();
          fd.set("message", pause.message);
          await pauseLink(fd);
          toast.show({ message: "Link paused" });
        } else {
          await resumeLink();
          toast.show({ message: "Link open again" });
        }
      } catch {
        setPaused(!next);
        toast.show({ message: "Your link didn't change. Check your connection and try again.", tone: "error" });
      }
    });
  };

  const sub = !paused ? "Senders see you're on a break" : pause.on && pause.until ? `Back on ${pause.until} · senders see you're away` : "Senders see you're away";

  return (
    <div className="border-b border-line">
      <div className={`${ROW} border-b-0`}>
        <RowText icon="pause" title="Pause your link" sub={sub} />
        <button
          type="button"
          role="switch"
          aria-checked={paused}
          aria-label="Pause your link"
          aria-busy={busy}
          onClick={flip}
          className={`relative h-8 w-[52px] shrink-0 rounded-full before:absolute before:-inset-1.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime ${paused ? "bg-lime" : "bg-line-2"}`}
        >
          <span aria-hidden className={`switch-thumb absolute left-[3px] top-[3px] size-[26px] rounded-full ${paused ? "translate-x-5 bg-[#0b0b0b]" : "bg-bone"}`} />
        </button>
      </div>
      {paused && (
        <details className="pb-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-[13px] text-mute underline underline-offset-[3px] [&::-webkit-details-marker]:hidden">
            Message and return date
          </summary>
          <form
            className="space-y-3 pt-1"
            action={(fd) =>
              start(async () => {
                fd.set("tz", String(new Date().getTimezoneOffset()));
                await pauseLink(fd);
                toast.show({ message: "Saved. Your link shows your message." });
              })
            }
          >
            <label className="block space-y-1.5">
              <span className={FIELD_LABEL}>Message on your link</span>
              <textarea name="message" defaultValue={pause.message} key={pause.message} maxLength={280} className="input min-h-16 resize-y" placeholder="On tour until mid-October. Send the new stuff then." />
            </label>
            <label className="block space-y-1.5">
              <span className={FIELD_LABEL}>Back on (optional)</span>
              <input name="until" type="date" value={until} onChange={(e) => setPicked({ for: pause.untilTs, value: e.target.value })} className="input" />
            </label>
            <button className={GHOST} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
