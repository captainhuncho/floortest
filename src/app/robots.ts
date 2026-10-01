import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Search and AI-search crawlers may read public pages; everything personal stays out. */
const PRIVATE = ["/dashboard", "/admin", "/api/", "/t/", "/s/", "/v/", "/sent/", "/reset/", "/verify-email/", "/confirm-email/", "/unsubscribe/", "/login", "/signup", "/forgot"];
const AI_SEARCH = ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-SearchBot", "Claude-User", "Google-Extended", "Applebot-Extended"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_SEARCH, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
    host: env.appUrl,
  };
}
