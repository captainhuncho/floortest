import "server-only";
import { KIND_LABEL } from "./db";

/** Who an admin view or announcement is about: plan, account type, admin tag, how recently they joined, and activity. */
export type Audience = { plan: string; kind: string; tag: string; joined: number; activity: "" | "active" | "inactive" };

const DAY = 86_400_000;
export const JOINED = { 0: "Any time", 7: "Last 7 days", 30: "Last 30 days", 90: "Last 90 days" } as Record<number, string>;
export const ACTIVITY = { "": "Any activity", active: "Active in the last 30 days", inactive: "Not active for 30+ days" } as const;

/** Read the filters from a query string or form. Anything unknown falls to "any". */
export function readAudience(get: (k: string) => unknown): Audience {
  const s = (k: string) => String(get(k) ?? "").trim();
  const joined = Number(s("joined"));
  const activity = s("activity");
  return {
    plan: /^[a-z][a-z0-9_]{1,23}$/.test(s("plan")) ? s("plan") : "",
    kind: s("kind") in KIND_LABEL ? s("kind") : "",
    tag: s("tag").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30),
    joined: joined in JOINED ? joined : 0,
    activity: activity === "active" || activity === "inactive" ? activity : "",
  };
}

/** SQL conditions on users `u`. Suspended accounts are left out unless `withSuspended` (the Users list shows them). */
export function audienceWhere(a: Audience, at = Date.now(), withSuspended = false) {
  const where = withSuspended ? ["TRUE"] : ["u.suspended_at IS NULL"];
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
  const parts = [a.kind && KIND_LABEL[a.kind], a.plan && planName(a.plan), a.tag && `tag ${a.tag}`, a.joined && `joined ${JOINED[a.joined].toLowerCase()}`, a.activity && ACTIVITY[a.activity].toLowerCase()];
  return parts.filter(Boolean).join(" · ") || "Everyone";
}

/** Tidy a free-text tag list: lowercase words, comma-separated, unique. */
export const cleanTags = (raw: string) =>
  [...new Set(raw.split(/[,\s]+/).map((t) => t.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30)).filter(Boolean))].slice(0, 20).join(",");
