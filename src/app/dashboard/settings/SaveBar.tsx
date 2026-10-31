"use client";

import { useEffect, useRef, useState } from "react";
import { BTN, Notice } from "./ui";

/**
 * The one way settings save: a Save button that wakes up when something in its form changes, with the result right
 * beside it ("Saved" fades after a few seconds; errors stay). Full width on phones.
 */
export function SaveBar({ pending, state, label = "Save", busyLabel = "Saving…", savedText = "Saved" }: {
  pending: boolean;
  state: { ok?: boolean; error?: string } | undefined;
  label?: string;
  busyLabel?: string;
  savedText?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [shown, setShown] = useState<typeof state>(undefined);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const mark = () => setDirty(true);
    form.addEventListener("input", mark);
    form.addEventListener("change", mark);
    return () => {
      form.removeEventListener("input", mark);
      form.removeEventListener("change", mark);
    };
  }, []);

  // Each new answer from the server shows; a saved one clears the unsaved mark and fades after a few seconds.
  const [answered, setAnswered] = useState(state);
  if (answered !== state) {
    setAnswered(state);
    if (state) {
      setShown(state);
      if (state.ok) setDirty(false);
    }
  }
  useEffect(() => {
    if (!state?.ok) return;
    const t = setTimeout(() => setShown(undefined), 4000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <div ref={ref} className="flex flex-col gap-3 border-t border-line pt-4">
      {shown?.error && (
        <Notice tone="error" next="Nothing was saved. Change that and save again.">
          {shown.error}
        </Notice>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <button className={`${BTN} w-full sm:w-auto sm:px-6!`} disabled={pending || !dirty}>
          {pending ? busyLabel : label}
        </button>
        <p role="status" className={shown?.ok ? "flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6aa636]" : "sr-only"}>
          {shown?.ok ? `✓ ${savedText}` : ""}
        </p>
        {!shown && dirty && !pending && <p className="text-[12px] text-mute">Unsaved changes</p>}
      </div>
    </div>
  );
}
