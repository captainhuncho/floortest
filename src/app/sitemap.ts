import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * The site's own public pages only. Receivers' links are shared by them, not listed for search engines:
 * they're also marked noindex (see [handle]/page.tsx).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/pricing", "/trust", "/contact", "/terms", "/privacy", "/cookies", "/privacy-choices", "/takedown", "/content-rules", "/subprocessors", "/security", "/law-enforcement", "/licenses"].map((p) => ({
    url: `${env.appUrl}${p}`,
    changeFrequency: p ? "monthly" : "weekly",
    priority: p ? 0.4 : 1,
  }));
}
