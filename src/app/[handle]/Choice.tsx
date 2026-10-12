"use client";

import { Req } from "@/components/Req";
import { MIX_STATUS } from "@/lib/plans";

/** The send forms' required answers, in one place so single tracks and folders always offer the same choices. */
export const MIX_CHOICES: [string, string][] = Object.entries(MIX_STATUS).map(([k, v]) => [k, v.replace(" & ", " and ")]);
export const RELEASE_CHOICES: [string, string][] = [["unsigned", "Unreleased"], ["signed", "Signed, forthcoming"], ["released", "Already released"]];
export const AI_CHOICES: [string, string][] = [["none", "No"], ["partial", "Partly"], ["full", "Fully AI-generated"]];
export const AI_HELP = "Partly means AI vocals, stems or mastering.";

/** A required either/or answer as a row of tappable choices (radio buttons underneath, so keyboards and FormData just work). */
export function Choice({
  id,
  name,
  label,
  options,
  value,
  onChange,
  issue,
  help,
  disabled = false,
}: {
  id: string;
  name: string;
  label: string;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  /** The problem line under the row, when there is one. */
  issue?: React.ReactNode;
  help?: string;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-1.5" aria-describedby={issue ? `${id}-issue` : help ? `${id}-help` : undefined}>
      <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-dim">
        {label}
        <Req />
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, text], i) => (
          <label
            key={v}
            className={`tap-tall inline-flex cursor-pointer items-center rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lime ${
              value === v ? "border-bone bg-bone text-ink" : `bg-ink-2 text-bone hover:border-line-2 ${issue ? "border-danger/60" : "border-line"}`
            }`}
          >
            <input id={i === 0 ? id : undefined} type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
            {text}
          </label>
        ))}
      </div>
      {issue}
      {help && !issue && (
        <p id={`${id}-help`} className="text-[12px] text-dim">
          {help}
        </p>
      )}
    </fieldset>
  );
}
