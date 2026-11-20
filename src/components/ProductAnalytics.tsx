"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { startForPage, withdraw } from "@/lib/posthog-client";
import { useConsent } from "@/lib/use-consent";

/**
 * Product analytics and session replay, only after Accept on the cookie banner (owner's rule; PostHog, EU region). Before
 * Accept nothing loads and nothing is stored. When consent leaves "accepted" ("Not now", or "Cookie settings" reopening
 * the banner) capture stops at once, the visitor is forgotten and PostHog's storage is cleared. Nobody is identified.
 * Recording runs only on the pages listed in src/lib/product-analytics.ts and never in an admin view.
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
