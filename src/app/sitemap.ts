import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * The site's own public pages only. Receivers' links are shared by them, not listed for search engines:
 * they're also marked noindex (see [handle]/page.tsx).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/trust", "/contact", "/terms", "/privacy", "/licenses"].map((p) => ({
    url: `${env.appUrl}${p}`,
    changeFrequency: p ? "monthly" : "weekly",
    priority: p ? 0.4 : 1,
  }));
}
