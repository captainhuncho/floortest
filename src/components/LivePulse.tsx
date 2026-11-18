"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { pulseLoop } from "@/lib/pulse-loop";
import { REFRESH_EVENT } from "./PullToRefresh";

/** What counts as someone using the page (src/lib/pulse-loop.ts stops checking after 5 minutes without any). */
const INPUT_EVENTS = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;

/**
 * Keeps an open page current without a reload: while the tab is visible (and at once when it comes back into view), it
 * asks `url` for a small change marker and refreshes the page's data when it differs. It checks every `every` ms, slows
 * to 30 s and then 60 s while nothing changes, and stops after 5 minutes with no input until the page is used again
 * (src/lib/pulse-loop.ts), so a tab left open doesn't keep the database awake. Playback and anything typed are kept;
 * while someone is typing, the refresh waits until they leave the field.
 */
export function LivePulse({ url, every = 10_000 }: { url: string; every?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);
  const due = useRef(false);

  useEffect(() => {
    let stopped = false;
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const refresh = () => {
      if (typing()) due.current = true;
      else {
        due.current = false;
        router.refresh();
      }
    };
    /** True when the marker changed. */
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return false;
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return false;
        const { v } = (await r.json()) as { v: string };
        const changed = last.current !== null && v !== last.current;
        if (changed) refresh();
        last.current = v;
        return changed;
      } catch {
        // Offline for a moment: try again next time.
        return false;
      }
    };
    const loop = pulseLoop(check, every);
    const onBlur = () => due.current && setTimeout(() => !typing() && due.current && refresh(), 0);
    // A pull to refresh just reloaded the page: take the current marker without refreshing again.
    const onPulled = () => {
      last.current = null;
      loop.wake();
    };
    const onVisible = () => document.visibilityState === "visible" && loop.wake();
    const onInput = () => loop.input();
    loop.start();
    window.addEventListener(REFRESH_EVENT, onPulled);
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("focusout", onBlur);
    for (const e of INPUT_EVENTS) window.addEventListener(e, onInput, { passive: true });
    return () => {
      stopped = true;
      loop.stop();
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener(REFRESH_EVENT, onPulled);
      for (const e of INPUT_EVENTS) window.removeEventListener(e, onInput);
    };
  }, [url, every, router]);

  return null;
}
