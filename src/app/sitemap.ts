import type { MetadataRoute } from "next";
import { q } from "@/lib/db";
import { env } from "@/lib/env";

export const revalidate = 3600;

/** Public pages only: the site's own pages, plus receivers' links (their send-music pages). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const pages = ["", "/trust", "/contact", "/terms", "/privacy", "/licenses"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: (p ? "monthly" : "weekly") as "monthly" | "weekly",
    priority: p ? 0.4 : 1,
  }));
  // lastModified is a real date (when the page was created), never "now", so it stays honest.
  const receivers = await q.all<{ handle: string; at: number }>(
    "SELECT handle, created_at AS at FROM users WHERE suspended_at IS NULL AND email_verified_at IS NOT NULL ORDER BY created_at LIMIT 5000",
  );
  return [...pages, ...receivers.map((r) => ({ url: `${base}/${r.handle}`, lastModified: new Date(r.at), changeFrequency: "monthly" as const, priority: 0.6 }))];
}
