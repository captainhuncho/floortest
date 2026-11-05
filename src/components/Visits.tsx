"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { redactUrl } from "@/lib/redact-url";
import { useConsent } from "@/lib/use-consent";

/**
 * In-house visit counter (owner, 5 Nov): one beacon per page shown, only after the visitor chooses Accept on the cookie
 * banner (owner's decision on #435), like the page-view counts; withdrawing stops it from the next page. The first page
 * counted in a tab is a visit, with the site it came from (or the link's utm_source); every page after is a view. Sends
 * only the path with any private key already removed (redactUrl), never the query, and stores nothing in the browser.
 */
export function Visits() {
  return useConsent() === "accepted" ? <Counter /> : null;
}

function Counter() {
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
      path: redactUrl(path),
      device,
      ...(landing ? { ref: document.referrer, utm: new URLSearchParams(location.search).get("utm_source") ?? "" } : {}),
    });
    if (!navigator.sendBeacon?.("/api/visit", new Blob([body], { type: "application/json" })))
      fetch("/api/visit", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  }, [path]);
  return null;
}
