"use client";

import { useEffect } from "react";

const MAX_PER_PAGE = 30;

/** What was tapped, without personal content: a button's short label, or just the kind of control. */
function label(el: Element | null) {
  const c = el?.closest("button, a, input, select, textarea, [role=button], [role=checkbox], [role=tab]");
  if (!c) return "page";
  const aria = c.getAttribute("aria-label");
  if (aria && aria.length <= 30) return aria;
  if (c.tagName === "BUTTON") {
    const text = (c.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text && text.length <= 24) return text;
    return "button";
  }
  if (c.tagName === "A") return "link";
  return c.tagName.toLowerCase();
}

/**
 * Tap speed for real visitors, including iPhone Safari (which has no INP API): the time from a tap or
 * key press to the next frame the browser paints. Batched and sent when the page is hidden.
 */
export function TapSpeed() {
  useEffect(() => {
    const batch: { path: string; target: string; ms: number }[] = [];
    let sent = 0;
    const device = matchMedia("(pointer: coarse)").matches ? (Math.min(screen.width, screen.height) >= 700 ? "tablet" : "phone") : "desktop";
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other";

    const flush = () => {
      if (!batch.length) return;
      const body = JSON.stringify({ device, browser, items: batch.splice(0) });
      if (!navigator.sendBeacon?.("/api/tap-speed", new Blob([body], { type: "application/json" })))
        fetch("/api/tap-speed", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    };
    const onInput = (e: Event) => {
      if (sent >= MAX_PER_PAGE) return;
      if (e instanceof KeyboardEvent && !["Enter", " ", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      const start = e.timeStamp;
      const target = label(e.target as Element);
      const path = location.pathname;
      // The frame after the handlers have run and the browser has painted the result.
      requestAnimationFrame(() =>
        setTimeout(() => {
          const ms = Math.round(performance.now() - start);
          if (ms < 0 || ms > 10_000) return;
          sent++;
          batch.push({ path, target, ms });
          if (batch.length >= 10) flush();
        }, 0),
      );
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    addEventListener("pointerup", onInput, true);
    addEventListener("keydown", onInput, true);
    document.addEventListener("visibilitychange", onHide);
    addEventListener("pagehide", flush);
    return () => {
      removeEventListener("pointerup", onInput, true);
      removeEventListener("keydown", onInput, true);
      document.removeEventListener("visibilitychange", onHide);
      removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  return null;
}
