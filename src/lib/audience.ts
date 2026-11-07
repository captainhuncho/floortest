import "server-only";
import { KIND_LABEL } from "./db";

/**
 * Who an admin view or announcement is about: plan, account type, admin tag, how recently they joined, and activity.
 * `nobody`: a filter was sent that can't be read, so the audience matches no account.
 */
export type Audience = { plan: string; kind: string; tag: string; joined: number; activity: "" | "active" | "inactive"; nobody?: true };

const DAY = 86_400_000;
export const JOINED = { 0: "Any time", 7: "Last 7 days", 30: "Last 30 days", 90: "Last 90 days" } as Record<number, string>;
export const ACTIVITY = { "": "Any activity", active: "Active in the last 30 days", inactive: "Not active for 30+ days" } as const;

/** The type filter for a type that doesn't exist: no account has it, so the filter matches nobody. */
export const UNKNOWN_KIND = "unknown";
/** A type filter in words, for chips and logs. */
export const kindLabel = (kind: string) => KIND_LABEL[kind] ?? "Unknown type (nobody)";

const AUDIENCE_KEYS = ["plan", "kind", "tag", "joined", "activity"] as const;
/**
 * Longest filter value read; anything longer matches nobody. A backstop: each field's own check (plan pattern, tag
 * length, the fixed lists for type, joined and activity) already refuses longer values.
 */
const MAX_FILTER = 100;
const MAX_TAG = 30;

/**
 * The filters exactly as sent, uncut, for links and forms that carry them on (paging, CSV, publish), plus nobody=1 when
 * they read as nobody (any unreadable value, or nobody itself). The server reads them again with readAudience, so the
 * preview and the publish always read the same audience, and nobody always travels on.
 */
export const audienceQuery = (get: (k: string) => unknown) => ({
  ...(Object.fromEntries(AUDIENCE_KEYS.map((k) => [k, String(get(k) ?? "").trim()])) as Record<(typeof AUDIENCE_KEYS)[number], string>),
  nobody: readAudience(get).nobody ? "1" : "",
});

/**
 * Read the filters from a query string or form. Empty means "any". A value that can't be read (a form or link from
 * another release, a hand-edited one, or one over the length limit) matches nobody rather than falling to "any", so a
 * stale announcement form can never reach everyone. `nobody` (sent by the release before this one) can only narrow.
 */
export function readAudience(get: (k: string) => unknown): Audience {
  const s = (k: string) => String(get(k) ?? "").trim();
  const plan = s("plan");
  // A tag is read only as typed (case aside): stripping characters could match a different tag ("beta 1" is not beta1).
  // Checked before lowercasing, which can turn other letters into ASCII (the Kelvin sign K becomes k).
  const tag = /^[A-Za-z0-9-]*$/.test(s("tag")) ? s("tag").toLowerCase() : "";
  const joined = s("joined");
  const activity = s("activity");
  const a: Audience = {
    plan: /^[a-z][a-z0-9_]{1,23}$/.test(plan) ? plan : "",
    kind: Object.hasOwn(KIND_LABEL, s("kind")) ? s("kind") : s("kind") ? UNKNOWN_KIND : "",
    tag: tag.length <= MAX_TAG ? tag : "",
    joined: Object.hasOwn(JOINED, joined) ? Number(joined) : 0,
    activity: activity === "active" || activity === "inactive" ? activity : "",
  };
  const unread =
    !!s("nobody") ||
    a.kind === UNKNOWN_KIND ||
    AUDIENCE_KEYS.some((k) => s(k).length > MAX_FILTER) ||
    (plan && !a.plan) ||
    (s("tag") && !a.tag) ||
    (joined && !Object.hasOwn(JOINED, joined)) ||
    (activity && !a.activity);
  return unread ? { ...a, nobody: true } : a;
}

/** Every audience filter off, nobody included: for "Clear all" and the unreadable-filter chip. */
export const AUDIENCE_CLEARED = { plan: "", kind: "", tag: "", joined: "", activity: "", nobody: "" } as const;

/**
 * The link change that takes the Type filter off. An unknown type is one cause of nobody; nobody goes with it unless
 * another filter still can't be read. A nobody carried on from an older form is dropped too: removing the filter is the
 * admin's own choice, and announcements read the audience again before publishing.
 */
export const kindOff = (get: (k: string) => unknown) => ({
  kind: "",
  nobody: readAudience((k) => (k === "kind" || k === "nobody" ? "" : get(k))).nobody ? "1" : "",
});

/** No filter set: every account. Newsletter subscribers (no account, so no plan, type or activity) join only then. */
export const audienceIsEveryone = (a: Audience) => !a.nobody && !a.plan && !a.kind && !a.tag && !a.joined && !a.activity;

/** SQL conditions on users `u`. Suspended accounts are left out unless `withSuspended` (the Users list shows them). */
export function audienceWhere(a: Audience, at = Date.now(), withSuspended = false) {
  const where = withSuspended ? ["TRUE"] : ["u.suspended_at IS NULL"];
  if (a.nobody) where.push("FALSE");
  const args: unknown[] = [];
  if (a.plan) {
    where.push("u.plan = ?");
    args.push(a.plan);
  }
  if (a.kind) {
    where.push("u.kind = ?");
    args.push(a.kind);
  }
  if (a.tag) {
    where.push("(',' || u.admin_tags || ',') LIKE ?");
    args.push(`%,${a.tag},%`);
  }
  if (a.joined) {
    where.push("u.created_at >= ?");
    args.push(at - a.joined * DAY);
  }
  if (a.activity === "active") {
    where.push("u.last_active_at >= ?");
    args.push(at - 30 * DAY);
  }
  if (a.activity === "inactive") {
    where.push("(u.last_active_at IS NULL OR u.last_active_at < ?)");
    args.push(at - 30 * DAY);
  }
  return { sql: where.join(" AND "), args };
}

/** "Labels · Pro · tag beta-1 · joined last 30 days", for logs and the announcement list. */
export function describeAudience(a: Audience, planName = (id: string) => id) {
  const parts = [a.kind && kindLabel(a.kind), a.plan && planName(a.plan), a.tag && `tag ${a.tag}`, a.joined && `joined ${JOINED[a.joined].toLowerCase()}`, a.activity && ACTIVITY[a.activity].toLowerCase()];
  return [...parts, a.nobody && a.kind !== UNKNOWN_KIND && "Unreadable filter (nobody)"].filter(Boolean).join(" · ") || "Everyone";
}

/** Tidy a free-text tag list: lowercase words, comma-separated, unique. */
export const cleanTags = (raw: string) =>
  [...new Set(raw.split(/[,\s]+/).map((t) => t.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30)).filter(Boolean))].slice(0, 20).join(",");
