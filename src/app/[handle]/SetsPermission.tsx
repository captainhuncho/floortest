"use client";

import { useId } from "react";

/**
 * The play-out permission, as its own card so senders make a real choice: a big switch, and a line that says
 * exactly what they're allowing either way. Off by default (listening and feedback only).
 */
export function SetsPermission({ receiverName, many, checked, onChange, disabled }: {
  receiverName: string;
  many: boolean;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  const it = many ? "these tracks" : "this track";
  const id = useId();
  return (
    <label className={`flex cursor-pointer items-start gap-4 rounded-xl border-2 p-4 transition ${checked ? "border-lime bg-lime/10" : "border-line-2 bg-ink-2"}`}>
      <span className="min-w-0 flex-1">
        <span aria-hidden className="block text-[11px] font-bold uppercase tracking-[0.5px] text-lime">Your call: DJ sets &amp; broadcasts</span>
        <span id={`${id}-q`} className="mt-1 block text-[15px] font-semibold text-bone">
          Let {receiverName} play {it} in DJ sets, live and on broadcasts?
        </span>
        <span id={`${id}-a`} className={`mt-1.5 block text-[13px] ${checked ? "text-lime" : "text-mute"}`} aria-live="polite">
          {checked ? `Yes: ${receiverName} can play ${it} out.` : `No: ${it === "this track" ? "it's" : "they're"} for listening and feedback only.`}
        </span>
      </span>
      <input type="checkbox" name="sets_ok" role="switch" aria-labelledby={`${id}-q`} aria-describedby={`${id}-a`} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`mt-1 flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition peer-focus-visible:outline-2 peer-focus-visible:outline-lime ${checked ? "bg-lime" : "bg-line-2"}`}>
        <span className={`size-6 rounded-full transition ${checked ? "translate-x-5 bg-ink" : "bg-bone"}`} />
      </span>
    </label>
  );
}
