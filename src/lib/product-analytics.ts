import { redactUrl } from "./redact-url";

/**
 * Product analytics and session replay (PostHog, EU region; owner's yes in the Desk, 20 Nov 2026). Loaded only by
 * src/lib/posthog-client.ts after Accept on the cookie banner, never on the ops host. Plain module so tests can import it.
 */
export const POSTHOG_HOST = "https://eu.i.posthog.com";
export const POSTHOG_UI_HOST = "https://eu.posthog.com";
/** Where the PostHog project's settings are read from (fetched, never run as a script). */
export const POSTHOG_ASSETS_HOST = "https://eu-assets.i.posthog.com";

/**
 * The only pages that may be recorded (an allow-list, Safety review of #704): the desk's music pages and the public home
 * and pricing pages. Everything else, including sign-in, private links, contacts, settings, admin, plans and checkout, is
 * never recorded.
 */
const MAY_RECORD = [
  "/dashboard/floor",
  "/dashboard/review",
  "/dashboard/list",
  "/dashboard/collections",
  "/dashboard/prepare",
  "/dashboard/projects",
  "/dashboard/played-out",
  "/dashboard/analytics",
  "/dashboard/how-it-works",
  "/pricing",
];

export function mayRecord(path: string): boolean {
  if (path === "/") return true;
  return MAY_RECORD.some((p) => path === p || path.startsWith(`${p}/`));
}

/** The dashboard layout marks an admin "view as" session with this attribute; nothing is recorded while it is there. */
export const RECORDING_OFF_ATTR = "data-recording-off";

export function recordingAllowed(path: string, doc: Pick<Document, "querySelector">): boolean {
  return mayRecord(path) && !doc.querySelector(`[${RECORDING_OFF_ATTR}]`);
}

/** Query keys that carry invite codes, tokens, emails or a next page: masked by PostHog and removed here too. */
export const SECRET_QUERY_KEYS = ["invite", "team", "token", "email", "code", "next"];
const SECRET_QUERY = new RegExp(`([?&](?:${SECRET_QUERY_KEYS.join("|")})=)[^&#\\s"')]*`, "gi");

/** Private-link keys (src/lib/redact-url.ts) and secret query values out of a URL or path. */
export function redactAnalyticsUrl(s: string): string {
  return redactUrl(s).replace(SECRET_QUERY, "$1[redacted]");
}

const URL_KEY = /(url|pathname|referrer|href)$/i;
const DROPPED = new Set(["title", "$title"]);

function redactProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (DROPPED.has(key)) continue;
    if (typeof value === "string" && URL_KEY.test(key)) out[key] = redactAnalyticsUrl(value);
    else if (value && typeof value === "object" && !Array.isArray(value) && (key === "$set" || key === "$set_once")) out[key] = redactProps(value as Record<string, unknown>);
    else out[key] = value;
  }
  return out;
}

/**
 * Every URL-like property (current, referrer, session entry, initial, previous page, including inside $set and $set_once)
 * loses private-link keys and secret query values, and the page title is dropped (contact pages carry a sender's name),
 * before any event leaves the browser.
 */
export function redactEventUrls<T extends { properties?: Record<string, unknown> }>(event: T): T {
  if (!event.properties) return event;
  return { ...event, properties: redactProps(event.properties) };
}

type Store = Pick<Storage, "length" | "key" | "removeItem">;

function clearStore(storage: Store) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith("ph_") || key?.startsWith("__ph")) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

/** After "Not now" or "Cookie settings", remove everything PostHog keeps in this browser: both storages and cookies. */
export function clearPosthogStorage(stores: Store[], doc: Pick<Document, "cookie">) {
  stores.forEach(clearStore);
  for (const part of doc.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name?.startsWith("ph_") || name?.startsWith("__ph")) doc.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}
