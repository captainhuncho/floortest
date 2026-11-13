"use client";

import { useEffect, useRef } from "react";

const FIELDS = [
  ["show_from", "Show from", "When the strip first appears."],
  ["starts_at", "Update starts", "Shown to people in their own time zone."],
  ["ends_at", "Update ends", ""],
  ["hide_after", "Hide after", "When the strip goes away."],
] as const;

type Key = (typeof FIELDS)[number][0];

/** A time as the value a datetime-local field takes, in this browser's time zone. */
function localValue(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * The four times of a notice. The server doesn't know the admin's time zone, so the browser turns each picked time into
 * an exact moment (epoch milliseconds) in a hidden field; the strip then shows it in each viewer's own zone.
 */
export function NoticeTimes({ values }: { values?: Partial<Record<Key, number>> }) {
  const shown = useRef<Partial<Record<Key, HTMLInputElement | null>>>({});
  const hidden = useRef<Partial<Record<Key, HTMLInputElement | null>>>({});
  useEffect(() => {
    for (const [k] of FIELDS) {
      const ms = values?.[k];
      const el = shown.current[k];
      if (el && ms) el.value = localValue(ms);
    }
  }, [values]);
  const zone = typeof Intl === "undefined" ? "" : Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <fieldset className="space-y-2">
      <legend className="label mb-1.5">Times</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([k, label, hint]) => (
          <label key={k} className="block space-y-1.5">
            <span className="label">{label}</span>
            <input
              type="datetime-local"
              required
              className="input"
              ref={(el) => {
                shown.current[k] = el;
              }}
              onChange={(e) => {
                const ms = new Date(e.target.value).getTime();
                const h = hidden.current[k];
                if (h) h.value = Number.isFinite(ms) ? String(ms) : "";
              }}
            />
            {hint && <span className="block text-[12.5px] text-mute">{hint}</span>}
            <input
              type="hidden"
              name={k}
              defaultValue={values?.[k] ? String(values[k]) : ""}
              ref={(el) => {
                hidden.current[k] = el;
              }}
            />
          </label>
        ))}
      </div>
      <p className="text-[12.5px] text-mute" suppressHydrationWarning>
        Times you pick are in this browser&rsquo;s time zone{zone ? ` (${zone})` : ""}.
      </p>
    </fieldset>
  );
}
