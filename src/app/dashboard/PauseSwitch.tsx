"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { pauseLink, resumeLink } from "./actions";

export type PauseState = { on: boolean; until: string | null; untilTs: number | null; message: string; blocked: string | null };

/** "Pause my link": the switch flips instantly; a note for senders and a reopen date are optional extras once paused. */
export function PauseSwitch({ pause }: { pause: PauseState }) {
  const [paused, setPaused] = useState(pause.on);
  const [busy, start] = useTransition();
  const toast = useToast();
  const [until, setUntil] = useState("");

  // Follow the server once it confirms (or if it changes elsewhere).
  useEffect(() => setPaused(pause.on), [pause.on]);
  useEffect(() => {
    if (!pause.untilTs) return setUntil("");
    const d = new Date(pause.untilTs);
    setUntil(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, [pause.untilTs]);

  const flip = () => {
    const next = !paused;
    setPaused(next);
    start(async () => {
      try {
        if (next) {
          const fd = new FormData();
          fd.set("message", pause.message);
          await pauseLink(fd);
          toast.show({ message: "Submissions paused" });
        } else {
          await resumeLink();
          toast.show({ message: "Submissions reopened" });
        }
      } catch {
        setPaused(!next);
        toast.show({ message: "Couldn't change that. Try again." });
      }
    });
  };

  return (
    <div className="rounded-lg border border-line bg-ink p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{paused ? "Paused" : "Taking submissions"}</p>
          <p className="mt-0.5 text-xs leading-snug text-mute">
            {paused ? (pause.on && pause.until ? `Reopens ${pause.until}` : "Your link shows you're on a break") : pause.blocked ? null : "Switch off while touring or on a break"}
          </p>
          {!paused && pause.blocked && (
            <Link href="/dashboard/collections" className="block text-xs leading-snug text-danger underline-offset-2 hover:underline">
              {pause.blocked} →
            </Link>
          )}
        </div>
        <button
          role="switch"
          aria-checked={!paused}
          aria-label="Accept submissions"
          aria-busy={busy}
          onClick={flip}
          className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${paused ? "bg-line" : "bg-lime"}`}
        >
          <span
            aria-hidden
            className={`absolute top-1 h-5 w-5 rounded-full transition-all ${paused ? "left-1 bg-mute" : "left-6 bg-ink"}`}
          />
        </button>
      </div>
      {paused && (
        <form
          className="mt-3 space-y-3 border-t border-line pt-3"
          action={(fd) =>
            start(async () => {
              fd.set("tz", String(new Date().getTimezoneOffset()));
              await pauseLink(fd);
              toast.show({ message: "Saved. Your link shows your message." });
            })
          }
        >
          <label className="block space-y-1.5">
            <span className="label">Message on your link</span>
            <textarea
              name="message"
              defaultValue={pause.message}
              key={pause.message}
              maxLength={280}
              className="input min-h-16 resize-y text-sm"
              placeholder="On tour until mid-October. Send the new stuff then!"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Reopen on (optional)</span>
            <input name="until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="input [color-scheme:dark]" />
          </label>
          <button className="btn-ghost btn-sm" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}
