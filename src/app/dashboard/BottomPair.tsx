"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/components/Player";

/** Inputs that bring up the on-screen keyboard (not ticks, sliders, buttons or file pickers). */
const TYPES_TEXT = 'textarea, [contenteditable=""], [contenteditable="true"], input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="reset"], [type="file"], [type="color"], [type="image"], [type="hidden"])';

/** True while a text field has focus: on a phone that means the keyboard is up. */
function useTypingInField() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const check = () => setTyping(!!document.activeElement?.matches(TYPES_TEXT));
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    return () => {
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
    };
  }, []);
  return typing;
}

/**
 * Phones: the mini player and the menu as one floating pair (owner's pick, 16 Nov). Two pieces, 8px apart, the same
 * width and glass, 12px in from the screen edges and above the home bar, with one shadow under both. The page scrolls
 * behind and fades into its own colour under them. While a text field has focus the pair steps aside, so the keyboard
 * never pushes it over the field.
 */
export function BottomPair({ children }: { children: React.ReactNode }) {
  const playing = !!usePlayer().current;
  const typing = useTypingInField();
  return (
    <>
      <div aria-hidden className={`bottom-fade fixed inset-x-0 bottom-0 z-30 md:hidden ${playing ? "h-[170px]" : "h-[110px]"}`} />
      <div
        data-bottom-pair
        data-typing={typing ? "" : undefined}
        className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-40 mx-auto flex max-w-[26rem] flex-col gap-2 md:hidden"
      >
        <span aria-hidden className="glass-shadow pointer-events-none absolute inset-0 -z-10 rounded-[22px]" />
        {children}
      </div>
    </>
  );
}
