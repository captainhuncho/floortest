"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    /** Set by a test (e2e/player-renders.spec.ts) to count commits per component; absent for everyone else. */
    __ftRenders?: Record<string, number>;
  }
}

/**
 * Counts how often a component commits, for the player re-render test only. Does nothing unless the page was opened
 * with `window.__ftRenders` set (a Playwright init script), so real visitors pay one empty effect per commit.
 */
export function useRenderProbe(name: string) {
  useEffect(() => {
    const counts = window.__ftRenders;
    if (counts) counts[name] = (counts[name] ?? 0) + 1;
  });
}
