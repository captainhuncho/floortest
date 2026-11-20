"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { startForPage, withdraw } from "@/lib/posthog-client";
import { useConsent } from "@/lib/use-consent";

/**
 * Product analytics and session replay, only after Accept on the cookie banner (owner's rule; PostHog, EU region). Before
 * Accept nothing loads and nothing is stored. When consent leaves "accepted" ("Not now", or "Cookie settings" reopening
 * the banner) capture stops at once and PostHog's storage is cleared; every event is also checked against the current
 * choice before it leaves. Nobody is identified. Replay (on, masked: docs/posthog.md) is limited to the
 * pages listed in src/lib/product-analytics.ts and never runs in an admin view.
 */
export function ProductAnalytics() {
  const consent = useConsent();
  const path = usePathname();

  useEffect(() => {
    if (consent === "pending") return;
    if (consent === "accepted") {
      if (path) startForPage(path);
      return;
    }
    withdraw();
  }, [consent, path]);

  return null;
}
