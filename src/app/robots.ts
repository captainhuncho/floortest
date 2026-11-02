import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { CRAWL_BLOCKED } from "@/lib/search-index";

/**
 * Search and AI-search crawlers may read public pages. Personal pages are kept out of results by their noindex header
 * (src/lib/search-index.ts), which crawlers can only see on paths they're allowed to open.
 */
const PRIVATE = CRAWL_BLOCKED;
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
