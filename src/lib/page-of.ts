import { RESERVED_HANDLES } from "@/lib/plans";
import { redactUrl } from "@/lib/redact-url";

/**
 * Collapses a path to its page, never the person or item: /receipt/abc123 → /receipt/:token, /dashboard/collections/42 → …/:id,
 * and anyone's receiving link (/djkwame) → /:link. Private links go through redactUrl (the same list Sentry and analytics
 * use), and any segment of 20+ letters, digits, _ or - is treated as a key too, so a new token route can't leak here.
 * Used by the speed and visit counters (the visit counter runs it in the browser too, before sending).
 */
export function pageOf(path: string) {
  const parts = redactUrl(path.split("?")[0]).split("/").filter(Boolean).slice(0, 4);
  if (parts.length === 1 && !RESERVED_HANDLES.has(parts[0].toLowerCase())) return "/:link";
  const out = parts.map((p, i) =>
    /^\d+$/.test(p) ? ":id" : p === "[token]" || (i > 0 && ["t", "s", "v", "share"].includes(parts[i - 1])) || p.length > 40 || /^[\w-]{20,}$/.test(p) ? ":token" : p,
  );
  return "/" + out.join("/");
}

/** The first part of every page FloorTest serves (src/app, with the (auth) group's pages); anything else is /other. */
const ROUTES = new Set([
  "c", "coming-soon", "confirm-email", "contact", "content-rules", "cookies", "dashboard", "invite", "join", "law-enforcement",
  "licenses", "newsletter", "pricing", "privacy", "privacy-choices", "receipt", "security", "sent", "subprocessors", "takedown",
  "terms", "trust", "unsubscribe", "verify-email", "waitlist", "forgot", "login", "reset", "signed-out", "signup",
]);

/** A page name from pageOf, kept only if it's one of our routes: later parts stay ids, keys or short lowercase words. */
export function knownPage(page: string) {
  if (page === "/" || page === "/:link") return page;
  const [first, ...rest] = page.split("/").filter(Boolean);
  if (!ROUTES.has(first)) return "/other";
  const tail = rest.slice(0, 2).map((p) => (p === ":id" || p === ":token" || /^[a-z][a-z-]{0,23}$/.test(p) ? p : ":x"));
  return "/" + [first, ...tail].join("/");
}
