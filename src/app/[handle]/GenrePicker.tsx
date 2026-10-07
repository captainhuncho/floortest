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
}: {
  genres: string[];
  value: string;
  onChange: (g: string) => void;
  inputClass: string;
  labelClass: string;
  invalid?: boolean;
}) {
  const [other, setOther] = useState(false);
  const selected = other ? OTHER : value;
  return (
    <div className="space-y-2">
      <label className="block space-y-1.5">
        <span className={labelClass}>Genre<Req /></span>
        <select
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
