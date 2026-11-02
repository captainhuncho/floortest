import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { PUBLIC_PAGES } from "@/lib/search-index";

/**
 * The site's own public pages only (src/lib/search-index.ts). Receivers' links are shared by them, not listed for
 * search engines: every other path answers noindex.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((page) => (page === "/" ? "" : page)).map((p) => ({
    url: `${env.appUrl}${p}`,
    changeFrequency: p ? "monthly" : "weekly",
    priority: p ? 0.4 : 1,
  }));
}
