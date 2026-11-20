import { redactUrl } from "./redact-url";

/**
 * Product analytics and session replay (PostHog, EU region; owner's yes in the Desk, 20 Nov 2026). Loaded only by
 * src/components/ProductAnalytics.tsx after Accept on the cookie banner, never on the ops host. Plain module so tests can
 * import it.
 */
export const POSTHOG_HOST = "https://eu.i.posthog.com";
export const POSTHOG_UI_HOST = "https://eu.posthog.com";

/** Pages never recorded: sign-in, private-link and account pages, admin, plans and checkout. */
const NO_RECORDING = [
  "/login",
  "/signup",
  "/forgot",
  "/reset",
  "/restore",
  "/accept-terms",
  "/signed-out",
  "/ops-login",
  "/verify-email",
  "/confirm-email",
  "/join",
  "/invite",
  "/receipt",
  "/sent",
  "/unsubscribe",
  "/privacy-choices",
  "/admin",
  "/dashboard/account",
  "/dashboard/settings",
  "/dashboard/plans",
  "/dashboard/checkout",
  "/dashboard/view-as",
];

export function mayRecord(path: string): boolean {
  return !NO_RECORDING.some((p) => path === p || path.startsWith(`${p}/`));
}

const URL_PROPS = ["$current_url", "$pathname", "$referrer", "$initial_current_url", "$initial_referrer", "$prev_pageview_pathname"];

/** Private links lose their key before any event leaves the browser (src/lib/redact-url.ts). */
export function redactEventUrls<T extends { properties?: Record<string, unknown> }>(event: T): T {
  if (!event.properties) return event;
  const properties = { ...event.properties };
  for (const key of URL_PROPS) {
    const value = properties[key];
    if (typeof value === "string") properties[key] = redactUrl(value);
  }
  return { ...event, properties };
}

/** After "Not now", remove anything an earlier Accept left in this browser. */
export function clearPosthogStorage(storage: Pick<Storage, "length" | "key" | "removeItem">, doc: Pick<Document, "cookie">) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith("ph_") || key?.startsWith("__ph")) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
  for (const part of doc.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name?.startsWith("ph_")) doc.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}
