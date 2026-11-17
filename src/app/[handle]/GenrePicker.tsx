"use client";

import { Req } from "@/components/Req";
import { useState } from "react";
import { chip } from "./Choice";

const OTHER = "__other";

/** Genre from the receiver's list, with "Other…" for anything that isn't on it. */
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
  const otherInput = other && (
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
  );
  // A receiver's own short list (6 at most) reads best as tap choices; the long default list stays a dropdown.
  if (genres.length <= 6 && !dropdown)
    return (
      <div className="space-y-2">
        <fieldset className="flex flex-col gap-1.5" aria-describedby={issue ? `${id}-issue` : undefined}>
          <legend className={`mb-1.5 ${labelClass}`}>
            Genre
            <Req />
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {[...genres, OTHER].map((g, i) => {
              const on = g === OTHER ? other : !other && value === g;
              return (
                <button
                  key={g}
                  type="button"
                  id={i === 0 ? id : undefined}
                  aria-pressed={on}
                  onClick={() => {
                    setOther(g === OTHER);
                    onChange(g === OTHER ? "" : g);
                  }}
                  className={`${chip(on, invalid)} ${g === OTHER && !on ? "border-dashed text-mute" : ""}`}
                >
                  {g === OTHER ? "Other…" : g}
                </button>
              );
            })}
          </div>
          {issue}
        </fieldset>
        {otherInput}
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
      {otherInput}
    </div>
  );
}
