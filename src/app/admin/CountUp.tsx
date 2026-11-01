"use client";

import { useEffect, useRef } from "react";

const SEEN = "floortest-admin-counted";

/**
 * A number that counts up from 0 the first time the Overview opens in a browser session (owner, 1 Nov: ops should
 * feel alive), then just shows the value. Server-rendered with the real number, so nothing is hidden without
 * JavaScript, and screen readers and reduced motion get the value at once.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0) return;
    let first = false;
    try {
      first = !sessionStorage.getItem(SEEN);
      // Marked a moment later, so every number on the page counts on that first visit.
      if (first) setTimeout(() => sessionStorage.setItem(SEEN, "1"), 1000);
    } catch {}
    if (!first || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 650);
      el.textContent = fmt(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = fmt(value);
    };
  }, [value]);
  return (
    // Keyed on the value, so a new number gets a fresh node React owns (the animation writes text directly).
    <span key={value} ref={ref} className={className}>
      {value.toLocaleString("en-GB")}
    </span>
  );
}
