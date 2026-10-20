"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactUrl } from "@/lib/redact-url";
import { useConsent } from "@/lib/use-consent";

/**
 * Page-view counts (Vercel Web Analytics), only after the visitor accepts on the cookie banner (owner's rule,
 * 20 Oct 2026); private links are counted without their key.
 */
export function PageViews() {
  const consent = useConsent();
  if (consent !== "accepted") return null;
  return <Analytics beforeSend={(e) => ({ ...e, url: redactUrl(e.url) })} />;
}
