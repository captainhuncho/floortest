"use client";

import { useTransition } from "react";
import { setTheme } from "../actions";

const OPTIONS = [
  { id: "night", label: "Night" },
  { id: "day", label: "Day" },
  { id: "system", label: "System" },
] as const;

/** Night, Day, or follow the device. Applies straight away. */
export function ThemeSwitch({ current }: { current: string }) {
  const [pending, start] = useTransition();
  return (
    <div role="radiogroup" aria-label="Appearance" className="flex rounded-lg border border-line bg-ink-3 p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={current === o.id}
          disabled={pending}
          onClick={() => start(() => setTheme(o.id))}
          className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${current === o.id ? "bg-bone text-ink" : "text-mute hover:text-bone"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
