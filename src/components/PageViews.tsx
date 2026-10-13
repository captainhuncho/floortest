"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactUrl } from "@/lib/redact-url";

/** Cookie-free page-view counts (Vercel Web Analytics); private links are counted without their key. */
export function PageViews() {
  return <Analytics beforeSend={(e) => ({ ...e, url: redactUrl(e.url) })} />;
}
