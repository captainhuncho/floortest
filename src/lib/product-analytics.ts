import { redactUrl } from "./redact-url";

/**
 * Product analytics and session replay (PostHog, EU region; owner's yes in the Desk, 20 Nov 2026). Loaded only by
 * src/lib/posthog-client.ts after Accept on the cookie banner, never on the ops host. Plain module so tests can import it.
 */
export const POSTHOG_HOST = "https://eu.i.posthog.com";
export const POSTHOG_UI_HOST = "https://eu.posthog.com";

/**
 * The only pages that may be recorded (an allow-list, Safety review of #704; owner, 20 Nov: never on sign-in, admin or
 * payment pages): the desk's music pages and the public home page. Everything else, including sign-in, account, private
 * links, sender uploads, contacts, settings, admin, view-as, pricing, plans and checkout, is never recorded.
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
/** A kept key's value must look like a page number or a view name; anything else (free text, an email) goes. */
const KEPT_QUERY_VALUE = /^[a-z0-9_-]{1,32}$/;

function decoded(raw: string): string | null {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

function keptPair(pair: string): boolean {
  const eq = pair.indexOf("=");
  const key = decoded(eq === -1 ? pair : pair.slice(0, eq))?.trim().toLowerCase() ?? "";
  const value = eq === -1 ? "" : decoded(pair.slice(eq + 1));
  return KEPT_QUERY_KEYS.has(key) && value !== null && KEPT_QUERY_VALUE.test(value);
}

function keepListedQuery(s: string): string {
  const hash = s.indexOf("#");
  const base = hash === -1 ? s : s.slice(0, hash);
  const q = base.indexOf("?");
  if (q === -1) return base;
  const kept = base.slice(q + 1).split("&").filter(keptPair);
  return kept.length ? `${base.slice(0, q)}?${kept.join("&")}` : base.slice(0, q);
}

/** Private-link keys (src/lib/redact-url.ts) out of the path; only listed query keys with short plain values kept; no fragment. */
export function redactAnalyticsUrl(s: string): string {
  return keepListedQuery(redactUrl(s));
}

const URL_KEY = /(url|pathname|referrer|href)$/i;
const DROPPED = new Set(["title", "$title"]);
/**
 * Campaign and ad-click properties PostHog builds from the address (utm_*, gad_source, mc_cid, gclid, fbclid, msclkid
 * and the like, and ph_keyword), also as $initial_… in $set_once: dropped, whatever they carry.
 */
const CAMPAIGN_KEY =
  /^(\$initial_)?(utm_[a-z_]+|gad_source|mc_cid|gclid|gclsrc|dclid|gbraid|wbraid|fbclid|msclkid|twclid|li_fat_id|igshid|ttclid|rdt_cid|epik|qclid|sccid|irclid|_kx|ph_keyword)$/i;
const NESTED = new Set(["$set", "$set_once"]);
const RRWEB_META = 4;
const RRWEB_CUSTOM = 5;

type Props = Record<string, unknown>;
const isProps = (v: unknown): v is Props => !!v && typeof v === "object" && !Array.isArray(v);

function redactProps(props: Props): Props {
  const out: Props = {};
  for (const [key, value] of Object.entries(props)) {
    if (DROPPED.has(key) || CAMPAIGN_KEY.test(key)) continue;
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
/** Where PostHog's toolbar keeps its launch parameters. */
const TOOLBAR_KEY = "_postHogToolbarParams";

type Store = Pick<Storage, "length" | "key" | "removeItem">;

function clearStore(storage: Store, keepOptOut: boolean) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (keepOptOut && key?.startsWith(OPT_OUT_KEY)) continue;
    if (key?.startsWith("ph_") || key?.startsWith("__ph") || key === TOOLBAR_KEY) keys.push(key);
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
