"use client";

import { Req } from "@/components/Req";
import { useState } from "react";

const OTHER = "__other";

/** Genre dropdown from the receiver's list, with "Other…" for anything that isn't on it. */
export function GenrePicker({
  genres,
  value,
  onChange,
  inputClass,
  labelClass,
  invalid,
  id,
  issue,
  dropdown = false,
  name,
}: {
  genres: string[];
  value: string;
  onChange: (g: string) => void;
  inputClass: string;
  labelClass: string;
  invalid?: boolean;
  id?: string;
  /** The problem line to show under the field, when there is one. */
  issue?: React.ReactNode;
  /** Always a dropdown (compact, e.g. one per track in a folder). */
  dropdown?: boolean;
  /** What the field is called for screen readers when its visible label is hidden (e.g. "Genre for Night Bloom"). */
  name?: string;
}) {
  const [otherPicked, setOther] = useState(false);
  // A genre typed earlier (e.g. answers restored after the page reloaded) that isn't on the list opens "Other".
  const other = otherPicked || (!!value && !genres.includes(value));
  const selected = other ? OTHER : value;
  // A receiver's own short list (6 at most) reads best as tappable choices; the long default list stays a dropdown.
  if (genres.length <= 6 && !dropdown)
    return (
      <div className="space-y-2">
        <fieldset className="flex flex-col gap-1.5" aria-describedby={issue ? `${id}-issue` : undefined}>
          <legend className={`mb-1.5 ${labelClass}`}>
            Genre
            <Req />
          </legend>
          {/* Compact chips (owner, 30 Oct): 36px to look at, a 44px tap area, two rows at phone width. */}
          <div className="flex flex-wrap gap-x-1.5 gap-y-2">
            {[...genres, OTHER].map((g, i) => {
              const on = g === OTHER ? other : !other && value === g;
              return (
                <label
                  key={g}
                  className={`relative inline-flex h-9 cursor-pointer items-center whitespace-nowrap rounded-[10px] border px-3 text-[13px] font-semibold transition-colors duration-150 before:absolute before:-inset-x-[3px] before:-inset-y-1 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lime ${
                    on
                      ? "border-lime/45 bg-lime/12 text-lime"
                      : `bg-well hover:border-line-2 ${g === OTHER ? "border-dashed text-mute" : "text-bone"} ${invalid ? "border-danger/60" : "border-line"}`
                  }`}
                >
                  <input
                    id={i === 0 ? id : undefined}
                    type="radio"
                    name={`${id}-choice`}
                    checked={on}
                    onChange={() => {
                      setOther(g === OTHER);
                      onChange(g === OTHER ? "" : g);
                    }}
                    className="sr-only"
                  />
                  {g === OTHER ? "Other…" : g}
                </label>
              );
            })}
          </div>
          {issue}
        </fieldset>
        {other && (
          <label className="block">
            <span className="sr-only">Your genre</span>
            <input className={`${inputClass} ${invalid ? "border-danger/60" : ""}`} aria-invalid={invalid || undefined} aria-describedby={issue ? `${id}-issue` : undefined} value={value} maxLength={40} autoFocus placeholder="Type your genre" onChange={(e) => onChange(e.target.value)} />
          </label>
        )}
      </div>
    );
  return (
    <div className="space-y-2">
      <label className="block space-y-1.5" htmlFor={id}>
        <span className={labelClass}>{name ?? "Genre"}<Req /></span>
        <select
          id={id}
          aria-describedby={issue ? `${id}-issue` : undefined}
          aria-invalid={invalid || undefined}
          className={`${inputClass} ${invalid ? "border-danger/60" : ""}`}
          value={selected}
          required
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setOther(true);
              onChange("");
            } else {
              setOther(false);
              onChange(e.target.value);
            }
          }}
        >
          <option value="" disabled>
            Choose a genre
          </option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
        {issue}
      </label>
      {other && (
        <label className="block">
          <span className="sr-only">Your genre</span>
          <input
            className={`${inputClass} ${invalid ? "border-danger/60" : ""}`}
            aria-invalid={invalid || undefined}
            aria-describedby={issue ? `${id}-issue` : undefined}
            value={value}
            maxLength={40}
            autoFocus
            placeholder="Type your genre"
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}
