"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeps an open page current without a reload: every few seconds, while the tab is visible, it asks `url` for a
 * small change marker and refreshes the page's data when it differs. Playback and anything typed are kept; while
 * someone is typing, the refresh waits until they leave the field.
 */
export function LivePulse({ url, every = 5000 }: { url: string; every?: number }) {
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
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const { v } = (await r.json()) as { v: string };
        if (last.current !== null && v !== last.current) refresh();
        last.current = v;
      } catch {
        // Offline for a moment: try again next time.
      }
    };
    const onBlur = () => due.current && setTimeout(() => !typing() && due.current && refresh(), 0);
    check();
    const id = setInterval(check, every);
    document.addEventListener("visibilitychange", check);
    document.addEventListener("focusout", onBlur);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      document.removeEventListener("focusout", onBlur);
    };
  }, [url, every, router]);

  return null;
}
