"use client";

import { useTransition } from "react";
import { SEG, segTab } from "@/components/Kit";
import { setTheme } from "../actions/settings";

const OPTIONS = [
  { id: "night", label: "Night" },
  { id: "day", label: "Day" },
  { id: "system", label: "System" },
] as const;

/** Night, Day, or follow the device. Applies straight away. */
export function ThemeSwitch({ current }: { current: string }) {
  const [pending, start] = useTransition();
  return (
    <div role="radiogroup" aria-label="Appearance" className={SEG}>
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={current === o.id}
          disabled={pending}
          onClick={() => start(() => setTheme(o.id))}
          className={`${segTab(current === o.id)} pointer-coarse:min-h-11 disabled:opacity-60`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
