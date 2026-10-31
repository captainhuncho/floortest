"use client";

import { useId } from "react";

/**
 * The play-out permission: a plain question with a switch, and a line that says exactly what the answer means.
 * Off by default (listening and feedback only). It carries legal weight, so it stays its own clear row rather
 * than a buried checkbox, but it no longer needs a box around it to be noticed.
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
    <label className="flex cursor-pointer items-start justify-between gap-4 border-t border-dashed border-line-2 pt-3">
      <span className="min-w-0 flex-1">
        <span id={`${id}-q`} className="block text-[13.5px] font-semibold leading-snug text-bone">
          Can {receiverName} play {it} in DJ sets and broadcasts?
        </span>
        <span id={`${id}-a`} className={`mt-1 block text-[11.5px] ${checked ? "text-lime" : "text-dim"}`} aria-live="polite">
          {checked ? `Yes. ${receiverName} can play ${it} out.` : `No. Listening and feedback only.`}
        </span>
      </span>
      <input type="checkbox" name="sets_ok" role="switch" aria-labelledby={`${id}-q`} aria-describedby={`${id}-a`} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lime ${checked ? "bg-lime" : "bg-line-2"}`}>
        <span className={`switch-thumb size-6 rounded-full ${checked ? "translate-x-5 bg-ink" : "bg-bone"}`} />
      </span>
    </label>
  );
}
