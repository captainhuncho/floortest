"use client";

import { Req } from "@/components/Req";
import { MIX_STATUS } from "@/lib/plans";

/** The send forms' required answers, in one place so single tracks and folders always offer the same choices. */
export const MIX_CHOICES: [string, string][] = Object.entries(MIX_STATUS).map(([k, v]) => [k, v.replace(" & ", " and ")]);
export const RELEASE_CHOICES: [string, string][] = [["unsigned", "Unreleased"], ["signed", "Signed, forthcoming"], ["released", "Already released"]];
export const AI_CHOICES: [string, string][] = [["none", "None"], ["partial", "Partly"], ["full", "Fully AI-generated"]];
export const AI_HELP = "Partly means AI vocals, stems or mastering.";
/** A send to a label or A&R desk: evaluation only (the default) or OK to play (owner, 15 Nov send rules). */
export const PLAY_CHOICES: [string, string][] = [["evaluation", "Evaluation only"], ["ok_to_play", "OK to play"]];
export const playHelp = (play: string, receiverName: string) =>
  play === "ok_to_play" ? `${receiverName} can listen, download and play it out.` : `${receiverName} can listen and download to evaluate it, not play it out.`;

/**
 * Short labels so each answer fits on one row of three (owner, 30 Oct: side by side, not stacked). Keyed by the saved
 * value, which never changes; the full wording stays the button's accessible name and shows as a hint once picked.
 */
const SHORT: Record<string, string> = {
  raw: "Work in progress",
  mixed: "Mixed",
  mastered: "Mastered",
  unsigned: "Unreleased",
  signed: "Signed",
  released: "Released",
  none: "None",
  partial: "Partly",
  full: "Fully AI",
  evaluation: "Evaluation only",
  ok_to_play: "OK to play",
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

/** One tap choice (owner, 17 Nov, option 48): a pill, 44px tall. The picked one is solid, never lime; `bad` marks a missing answer. */
export const chip = (on: boolean, bad = false) =>
  `inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-3.5 text-[14px] transition-colors duration-150 ${
    on ? "border-bone bg-bone font-semibold text-ink" : `bg-well text-bone hover:border-line-2 ${bad ? "border-danger/60" : "border-line"}`
  }`;

/**
 * A required either/or answer as a labelled group of toggle buttons (`aria-pressed`). The answer travels in a hidden
 * field, so FormData just works. Each button's name is the full wording; the pill shows the short one.
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
  // The picked answer's full wording, when the pill shows a shorter one (and no other help line is given).
  const picked = options.find(([v]) => v === value);
  const hint = help ?? (picked && SHORT[picked[0]] && SHORT[picked[0]] !== picked[1] ? `${picked[1]}.` : undefined);
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-1.5" aria-describedby={issue ? `${id}-issue` : hint ? `${id}-help` : undefined}>
      <legend className="mb-1.5 text-[12px] text-mute">
        {label}
        <Req />
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, text], i) => (
          <button key={v} type="button" id={i === 0 ? id : undefined} aria-pressed={value === v} aria-label={text} onClick={() => onChange(v)} className={chip(value === v, !!issue)}>
            <ShortLabel full={text} short={SHORT[v] ?? text} />
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={value} />
      {issue}
      {hint && !issue && (
        <p id={`${id}-help`} className="text-[12px] text-dim">
          {hint}
        </p>
      )}
    </fieldset>
  );
}
