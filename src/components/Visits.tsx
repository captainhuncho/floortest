"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * In-house visit counter (owner, 5 Nov): one beacon per page shown. The first page of a tab counts as a visit, with the
 * site it came from (or the link's utm_source); every page counts as a view. Sends only the path, never the query or
 * any key (the server keeps the page name only), and stores nothing in the browser.
 */
export function Visits() {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (!path || navigator.webdriver) return;
    const landing = first.current;
    first.current = false;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const device = coarse ? (Math.min(screen.width, screen.height) >= 700 ? "tablet" : "phone") : "desktop";
    const body = JSON.stringify({
      kind: landing ? "visit" : "view",
      path,
      device,
      ...(landing ? { ref: document.referrer, utm: new URLSearchParams(location.search).get("utm_source") ?? "" } : {}),
    });
    if (!navigator.sendBeacon?.("/api/visit", new Blob([body], { type: "application/json" })))
      fetch("/api/visit", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  }, [path]);
  return null;
}
