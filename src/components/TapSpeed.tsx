"use client";

import { useEffect } from "react";

const MAX_PER_PAGE = 30;
/** A page change that takes longer than this is treated as abandoned, not slow. */
const NAV_GIVE_UP_MS = 15_000;
type Kind = "tap" | "nav" | "load";

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
 * Speed for real visitors, including iPhone Safari (which has no INP API):
 * - tap: from a tap or key press to the next frame the browser paints;
 * - nav: from tapping a link to the next page showing (in-app page changes);
 * - load: from opening a page fresh to its first content on screen.
 * Batched and sent when the page is hidden.
 */
export function TapSpeed() {
  useEffect(() => {
    const batch: { kind: Kind; path: string; target: string; ms: number }[] = [];
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
          batch.push({ kind: "tap", path, target, ms });
          if (batch.length >= 10) flush();
        }, 0),
      );
    };

    // Page changes: from the tap on a link to the frame after the new page is on screen (Next.js updates the
    // address once the new page has rendered). A link to the page you're on, a new tab or a download isn't counted.
    let nav: { start: number; from: string } | null = null;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      const from = location.pathname + location.search;
      nav = { start: e.timeStamp, from };
      const watch = () => {
        if (!nav) return;
        if (location.pathname + location.search !== nav.from) {
          const start = nav.start;
          nav = null;
          requestAnimationFrame(() =>
            setTimeout(() => {
              const ms = Math.round(performance.now() - start);
              if (sent >= MAX_PER_PAGE || ms > NAV_GIVE_UP_MS) return;
              sent++;
              batch.push({ kind: "nav", path: location.pathname, target: "link", ms });
              if (batch.length >= 10) flush();
            }, 0),
          );
          return;
        }
        if (performance.now() - nav.start > NAV_GIVE_UP_MS) return void (nav = null);
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    };

    // First load of this page: when its first content appeared (paint timing works in Safari too).
    const recordLoad = () => {
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
      const nav0 = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const ms = Math.round(fcp ?? nav0?.domContentLoadedEventEnd ?? 0);
      if (ms > 0 && ms < 60_000 && nav0?.type !== "back_forward") batch.push({ kind: "load", path: location.pathname, target: "page", ms });
    };
    if (document.readyState === "complete") recordLoad();
    else addEventListener("load", recordLoad, { once: true });
    const onHide = () => document.visibilityState === "hidden" && flush();
    addEventListener("pointerup", onInput, true);
    addEventListener("click", onClick, true);
    addEventListener("keydown", onInput, true);
    document.addEventListener("visibilitychange", onHide);
    addEventListener("pagehide", flush);
    return () => {
      removeEventListener("pointerup", onInput, true);
      removeEventListener("click", onClick, true);
      removeEventListener("load", recordLoad);
      removeEventListener("keydown", onInput, true);
      document.removeEventListener("visibilitychange", onHide);
      removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  return null;
}
