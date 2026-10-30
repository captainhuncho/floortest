"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { pauseLink, resumeLink } from "./actions/desk";
import { useBrowserValue } from "@/components/useBrowserValue";
import { IconBox } from "@/components/Kit";

export type PauseState = { on: boolean; until: string | null; untilTs: number | null; message: string; blocked: string | null };

/** A timestamp as YYYY-MM-DD in this browser's time zone, or "" for none. */
function localDate(ts: number | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Pause my link": the switch flips instantly; a note for senders and a reopen date are optional extras once paused. */
/** `compact`: the desktop sidebar's small Figma card. */
export function PauseSwitch({ pause, compact = false }: { pause: PauseState; compact?: boolean }) {
  const [paused, setPaused] = useState(pause.on);
  const [busy, start] = useTransition();
  const toast = useToast();
  // Follow the server once it confirms (or if it changes elsewhere).
  const [serverOn, setServerOn] = useState(pause.on);
  if (serverOn !== pause.on) {
    setServerOn(pause.on);
    setPaused(pause.on);
  }
  // The reopen date in the browser's own calendar (the server doesn't know the visitor's time zone); a date the person
  // picks stays until the server's changes.
  const saved = useBrowserValue(() => localDate(pause.untilTs), "");
  const [picked, setPicked] = useState<{ for: number | null; value: string } | null>(null);
  const until = picked && picked.for === pause.untilTs ? picked.value : saved;
  const setUntil = (value: string) => setPicked({ for: pause.untilTs, value });

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
        toast.show({ message: "Couldn't change that. Try again." });
      }
    });
  };

  return (
    <div className={compact ? "card bg-ink-3 p-3" : "py-1"}>
      <div className="flex items-start justify-between gap-3">
        {!compact && <IconBox name="link" small />}
        <div className="min-w-0 flex-1">
          <p className={compact ? "text-[11px] font-bold" : "text-[13px] font-semibold"}>{paused ? "Paused" : "Link open"}</p>
          <p className={compact ? "mt-1 text-[11px] leading-snug text-faint" : "mt-0.5 text-[11.5px] leading-snug text-mute"}>
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
          aria-label="Link open"
          aria-busy={busy}
          onClick={flip}
          className={`relative shrink-0 rounded-full transition-colors ${compact ? "h-4 w-7" : "mt-0.5 h-7 w-12"} ${paused ? "bg-line" : compact ? "bg-bone" : "bg-lime"}`}
        >
          <span
            aria-hidden
            className={`switch-thumb absolute rounded-full ${compact ? "left-0.5 top-0.5 h-3 w-3" : "left-1 top-1 h-5 w-5"} ${paused ? "bg-mute" : `${compact ? "translate-x-3" : "translate-x-5"} bg-ink`}`}
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
              className="input min-h-16 resize-y"
              placeholder="On tour until mid-October. Send the new stuff then."
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
