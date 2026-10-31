"use client";

import { Req } from "@/components/Req";
import { MIX_STATUS } from "@/lib/plans";

/** The send forms' required answers, in one place so single tracks and folders always offer the same choices. */
export const MIX_CHOICES: [string, string][] = Object.entries(MIX_STATUS).map(([k, v]) => [k, v.replace(" & ", " and ")]);
export const RELEASE_CHOICES: [string, string][] = [["unsigned", "Unreleased"], ["signed", "Signed, forthcoming"], ["released", "Already released"]];
export const AI_CHOICES: [string, string][] = [["none", "No"], ["partial", "Partly"], ["full", "Fully AI-generated"]];
export const AI_HELP = "Partly means AI vocals, stems or mastering.";

/**
 * Short labels so each answer fits on one row of three (owner, 30 Oct: side by side, not stacked). Keyed by the saved
 * value, which never changes; the full wording stays the radio's accessible name and shows as a hint once picked.
 */
const SHORT: Record<string, string> = {
  raw: "Work in progress",
  mixed: "Mixed",
  mastered: "Mastered",
  unsigned: "Unreleased",
  signed: "Signed",
  released: "Released",
  none: "No",
  partial: "Partly",
  full: "Fully AI",
};

/** The visible short label; when the full wording starts with it, the rest stays in the text (hidden), so the label's text is still the full wording. */
function ShortLabel({ full, short }: { full: string; short: string }) {
  if (short === full) return <>{full}</>;
  if (full.startsWith(short))
    return (
      <>
        {short}
        <span className="hidden">{full.slice(short.length)}</span>
      </>
    );
  return <>{short}</>;
}

/**
 * A required either/or answer as one segmented row (radio buttons underneath, so keyboards and FormData just work).
 * Falls back to wrapping choices for any option set without short labels.
 */
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
  const seg = options.length <= 4 && options.every(([v]) => SHORT[v]);
  // The picked answer's full wording, when the tab shows a shorter one (and no other help line is given).
  const picked = options.find(([v]) => v === value);
  const hint = help ?? (seg && picked && SHORT[picked[0]] !== picked[1] ? `${picked[1]}.` : undefined);
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-1.5" aria-describedby={issue ? `${id}-issue` : hint ? `${id}-help` : undefined}>
      <legend className="mb-1.5 text-[11.5px] font-semibold text-mute">
        {label}
        <Req />
      </legend>
      <div
        className={
          seg
            ? `flex gap-[3px] rounded-[13px] border bg-well p-[3px] ${issue ? "border-danger/60" : "border-line"}`
            : "flex flex-wrap gap-1.5"
        }
      >
        {options.map(([v, text], i) => {
          const on = value === v;
          const input = <input id={i === 0 ? id : undefined} type="radio" name={name} value={v} checked={on} aria-label={seg ? text : undefined} onChange={() => onChange(v)} className="sr-only" />;
          return seg ? (
            <label
              key={v}
              className={`relative flex min-h-9 min-w-0 flex-[1_1_auto] cursor-pointer before:absolute before:-inset-[3px] items-center justify-center rounded-[10px] px-2 text-center text-[13px] font-semibold transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-lime ${
                on ? "bg-lime/12 text-lime shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-lime)_45%,transparent)]" : "text-mute hover:text-bone"
              }`}
            >
              {input}
              <span className="relative truncate">
                <ShortLabel full={text} short={SHORT[v]} />
              </span>
            </label>
          ) : (
            <label
              key={v}
              className={`tap-tall inline-flex cursor-pointer items-center rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lime ${
                on ? "border-bone bg-bone text-ink" : `bg-ink-2 text-bone hover:border-line-2 ${issue ? "border-danger/60" : "border-line"}`
              }`}
            >
              {input}
              {text}
            </label>
          );
        })}
      </div>
      {issue}
      {hint && !issue && (
        <p id={`${id}-help`} className="text-[11.5px] text-dim">
          {hint}
        </p>
      )}
    </fieldset>
  );
}
