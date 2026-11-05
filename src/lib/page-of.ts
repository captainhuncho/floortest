import { RESERVED_HANDLES } from "@/lib/plans";
import { redactUrl } from "@/lib/redact-url";

/**
 * Collapses a path to its page, never the person or item: /receipt/abc123 → /receipt/:token, /dashboard/collections/42 → …/:id,
 * and anyone's receiving link (/djkwame) → /:link. Private links go through redactUrl (the same list Sentry and analytics
 * use), and any segment of 20+ letters, digits, _ or - is treated as a key too, so a new token route can't leak here.
 * Used by the speed and visit counters.
 */
export function pageOf(path: string) {
  const parts = redactUrl(path.split("?")[0]).split("/").filter(Boolean).slice(0, 4);
  if (parts.length === 1 && !RESERVED_HANDLES.has(parts[0].toLowerCase())) return "/:link";
  const out = parts.map((p, i) =>
    /^\d+$/.test(p) ? ":id" : p === "[token]" || (i > 0 && ["t", "s", "v", "share"].includes(parts[i - 1])) || p.length > 40 || /^[\w-]{20,}$/.test(p) ? ":token" : p,
  );
  return "/" + out.join("/");
}
