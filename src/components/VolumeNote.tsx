"use client";

import { useEffect, useState } from "react";
import { volumeWords } from "@/lib/player-keys";

/** How long the volume note stays after a key press. */
const NOTE_MS = 1500;
/** Screen readers hear the volume once, after the keys settle, not at every step. */
const SAY_MS = 600;

/**
 * "Volume 60%" for a moment after Shift+↑ / Shift+↓, and "Muted" while muted, in small quiet text by the time. A
 * polite live region says the final value once.
 */
export function VolumeNote({ volume, muted, touched, className = "" }: { volume: number; muted: boolean; touched: number; className?: string }) {
  // Shown while the latest key press is newer than the last one the timer hid.
  const [hiddenUpTo, setHiddenUpTo] = useState(0);
  const [said, setSaid] = useState("");
  const words = volumeWords(volume, muted);
  useEffect(() => {
    if (!touched) return;
    const hide = setTimeout(() => setHiddenUpTo(touched), NOTE_MS);
    const say = setTimeout(() => setSaid(words), SAY_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(say);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per key press; words is read at that moment
  }, [touched]);
  const show = touched > hiddenUpTo || muted || volume === 0;
  return (
    <>
      <span
        data-volume-note
        aria-hidden
        className={`shrink-0 text-[11px] text-faint tnum transition-opacity duration-150 motion-reduce:transition-none ${show ? "opacity-100" : "opacity-0"} ${className}`}
      >
        {words}
      </span>
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </>
  );
}
