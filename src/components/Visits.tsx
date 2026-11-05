"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { readConsent } from "@/lib/consent";
import { useConsent } from "@/lib/use-consent";
import { visitBeacon } from "@/lib/visit-beacon";

/**
 * In-house visit counter (owner, 5 Nov): one beacon per page shown, only after the visitor chooses Accept on the cookie
 * banner (owner's decision on #435), like the page-view counts; withdrawing stops it from the next page. The first page
 * counted in a tab is a visit, with the site it came from (or the link's utm_source); every page after is a view. Sends
 * only the page as the server stores it (keys, unknown pages and queries removed here, src/lib/visit-beacon.ts) and the
 * referring site's name (never our own pages), and stores nothing in the browser. The rules live in src/lib/visit-beacon.ts so they can be tested.
 */
export function Visits() {
  const consent = useConsent();
  return consent === "accepted" ? <Counter consent={consent} /> : null;
}

function Counter({ consent }: { consent: string }) {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (!path || navigator.webdriver) return;
    const landing = first.current;
    first.current = false;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const device = coarse ? (Math.min(screen.width, screen.height) >= 700 ? "tablet" : "phone") : "desktop";
    // Read again at each page: a withdrawal in another tab stops the next page here too.
    const body = visitBeacon({ consent: consent === "accepted" ? (readConsent() ?? "") : consent, path, landing, referrer: document.referrer, search: location.search, host: location.host, device,
      linkHandle: document.querySelector("[data-visit-handle]")?.getAttribute("data-visit-handle") ?? null,
    });
    if (!body) return;
    let sent = false;
    try {
      sent = navigator.sendBeacon?.("/api/visit", new Blob([body], { type: "application/json" })) ?? false;
    } catch {
      sent = false;
    }
    if (!sent) fetch("/api/visit", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  }, [path, consent]);
  return null;
}
