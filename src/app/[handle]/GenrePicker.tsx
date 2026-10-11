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
  const [other, setOther] = useState(false);
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
          <div className="flex flex-wrap gap-1.5">
            {[...genres, OTHER].map((g, i) => {
              const on = g === OTHER ? other : !other && value === g;
              return (
                <label
                  key={g}
                  className={`tap-tall inline-flex cursor-pointer items-center rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lime ${
                    on ? "border-bone bg-bone text-ink" : `bg-ink-2 text-bone hover:border-line-2 ${invalid ? "border-danger/60" : "border-line"}`
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
                  {g === OTHER ? "Something else" : g}
                </label>
              );
            })}
          </div>
          {issue}
        </fieldset>
        {other && (
          <label className="block">
            <span className="sr-only">Your genre</span>
            <input className={`${inputClass} ${invalid ? "border-danger/60" : ""}`} value={value} maxLength={40} autoFocus placeholder="Type your genre" onChange={(e) => onChange(e.target.value)} />
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
