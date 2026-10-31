"use client";

import { useEffect } from "react";

/** How much of the screen the on-screen keyboard must cover before the layout stops centring. */
const KEYBOARD_PX = 120;

/**
 * Phones: while the on-screen keyboard is open, the sign-in and sign-up column stops centring its content (the
 * spacers collapse, `af-kb` in auth.css), and the field being typed in stays in the middle of what's visible.
 */
export function KeyboardWatch() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const open = window.innerHeight - vv.height > KEYBOARD_PX;
      document.body.classList.toggle("af-kb", open);
      const active = document.activeElement;
      if (open && active instanceof HTMLInputElement) active.scrollIntoView({ block: "center" });
    };
    vv.addEventListener("resize", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      document.body.classList.remove("af-kb");
    };
  }, []);
  return null;
}
