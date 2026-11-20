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

/** Query keys that carry invite codes, tokens, emails or a next page: masked by PostHog's own setting too. */
export const SECRET_QUERY_KEYS = ["invite", "team", "token", "email", "code", "next"];

/**
 * The only query keys that may leave the browser (Safety review of #704): paging and view switches. Everything else,
 * including searches (q, sender, genre, handle, ref, to) and invite codes, is removed, and so is any #fragment.
 */
const KEPT_QUERY_KEYS = new Set(["p", "view", "tab", "folder"]);

function queryKey(pair: string): string {
  const raw = pair.split("=")[0] ?? "";
  try {
    return decodeURIComponent(raw.replace(/\+/g, " ")).trim().toLowerCase();
  } catch {
    return "";
  }
}

function keepListedQuery(s: string): string {
  const hash = s.indexOf("#");
  const base = hash === -1 ? s : s.slice(0, hash);
  const q = base.indexOf("?");
  if (q === -1) return base;
  const kept = base.slice(q + 1).split("&").filter((pair) => KEPT_QUERY_KEYS.has(queryKey(pair)));
  return kept.length ? `${base.slice(0, q)}?${kept.join("&")}` : base.slice(0, q);
}

/** Private-link keys (src/lib/redact-url.ts) out of the path; only listed query keys kept; no fragment. */
export function redactAnalyticsUrl(s: string): string {
  return keepListedQuery(redactUrl(s));
}

const URL_KEY = /(url|pathname|referrer|href)$/i;
const DROPPED = new Set(["title", "$title"]);
const NESTED = new Set(["$set", "$set_once"]);
const RRWEB_META = 4;
const RRWEB_CUSTOM = 5;

type Props = Record<string, unknown>;
const isProps = (v: unknown): v is Props => !!v && typeof v === "object" && !Array.isArray(v);

function redactProps(props: Props): Props {
  const out: Props = {};
  for (const [key, value] of Object.entries(props)) {
    if (DROPPED.has(key)) continue;
    if (typeof value === "string" && URL_KEY.test(key)) out[key] = redactAnalyticsUrl(value);
    else if (key === "$snapshot_data") out[key] = redactSnapshots(value);
    else if (NESTED.has(key) && isProps(value)) out[key] = redactProps(value);
    else out[key] = value;
  }
  return out;
}

/** Replay frames: the page address in rrweb's Meta frame and in custom frames ($url_changed, $pageview). */
function redactFrame(frame: unknown): unknown {
  if (!isProps(frame) || !isProps(frame.data)) return frame;
  if (frame.type === RRWEB_META && typeof frame.data.href === "string") {
    return { ...frame, data: { ...frame.data, href: redactAnalyticsUrl(frame.data.href) } };
  }
  if (frame.type === RRWEB_CUSTOM && isProps(frame.data.payload)) {
    return { ...frame, data: { ...frame.data, payload: redactProps(frame.data.payload) } };
  }
  return frame;
}

function redactSnapshots(data: unknown): unknown {
  return Array.isArray(data) ? data.map(redactFrame) : redactFrame(data);
}

/**
 * Every URL-like property (current, referrer, session entry, initial, previous page) loses private-link keys and every
 * unlisted query value, in the properties, in $set and $set_once (which PostHog keeps at the top of the event) and in
 * replay frames. The page title is dropped (contact pages carry a sender's name). Runs before any event leaves.
 */
export function redactEventUrls<T extends object>(event: T): T {
  const e = event as Props;
  const out: Props = { ...e };
  if (isProps(e.properties)) out.properties = redactProps(e.properties);
  for (const key of NESTED) if (isProps(e[key])) out[key] = redactProps(e[key]);
  return out as T;
}

const OPT_OUT_KEY = "__ph_opt_in_out_";

type Store = Pick<Storage, "length" | "key" | "removeItem">;

function clearStore(storage: Store, keepOptOut: boolean) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (keepOptOut && key?.startsWith(OPT_OUT_KEY)) continue;
    if (key?.startsWith("ph_") || key?.startsWith("__ph")) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

/**
 * After "Not now" or "Cookie settings", remove what PostHog keeps in this browser (both storages and cookies). While
 * PostHog is live on the page its opt-out record stays (`keepOptOut`), so it keeps knowing the visitor said no; the next
 * page load, where PostHog never starts, removes that too.
 */
export function clearPosthogStorage(stores: Store[], doc: Pick<Document, "cookie">, keepOptOut = false) {
  stores.forEach((store) => clearStore(store, keepOptOut));
  for (const part of doc.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (keepOptOut && name?.startsWith(OPT_OUT_KEY)) continue;
    if (name?.startsWith("ph_") || name?.startsWith("__ph")) doc.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}
