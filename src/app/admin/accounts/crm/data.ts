import "server-only";
import { audienceWhere, type Audience } from "@/lib/audience";
import { PAGE_SIZE, securityWhere, type Security } from "@/lib/admin-bulk";
import { KIND_LABEL, likeContains, q } from "@/lib/db";
import { statusOf, VIEW_KEYS, viewWhere, type Status, type View } from "./model";

/** One account as the new Users shows it. Email only for those who may see it (everyone with Users today). */
export type CrmRow = {
  id: number;
  name: string;
  handle: string;
  email: string | null;
  plan: string;
  kind: string;
  tags: string[];
  status: Status;
  note: string;
  live: number;
  joined: string;
  twoFactor: boolean;
};

/**
 * The page of accounts and each saved view's count, with today's filters (type, plan, tag, joined, activity,
 * security) and search on top. Parameterised, named columns, 50 a page; the latest note is one indexed lookup per row.
 */
export async function crmRows(o: { aud: Audience; security: Security; search: string; view: View; page: number; at: number; showEmail: boolean }) {
  const w = audienceWhere(o.aud, o.at, true);
  const base = `${w.sql} AND ${securityWhere(o.security)} ${o.search ? "AND (u.name ILIKE ? OR u.email ILIKE ? OR u.handle ILIKE ?)" : ""}`;
  const baseArgs = [...w.args, ...(o.search ? Array(3).fill(likeContains(o.search)) : [])];
  const v = viewWhere(o.view, o.at);
  const where = `${base} AND ${v.sql}`;
  const args = [...baseArgs, ...v.args];
  // Every view's count in one pass over the same filters (the view tabs show them).
  const counted = VIEW_KEYS.map((k) => viewWhere(k, o.at));
  const [counts, rows] = await Promise.all([
    q.get<Record<View, number>>(
      `SELECT ${VIEW_KEYS.map((k, i) => `COUNT(*) FILTER (WHERE ${counted[i].sql}) AS "${k}"`).join(", ")} FROM users u WHERE ${base}`,
      ...counted.flatMap((c) => c.args),
      ...baseArgs,
    ),
    q.all<{
      id: number; name: string; handle: string; email: string; plan: string; kind: string | null; admin_tags: string; created_at: number;
      suspended_at: number | null; email_verified_at: number | null; totp_enabled_at: number | null; live: number; note: string | null;
    }>(
      `SELECT u.id, u.name, u.handle, u.email, u.plan, u.kind, u.admin_tags, u.created_at, u.suspended_at, u.email_verified_at, u.totp_enabled_at,
         (SELECT COUNT(*) FROM tracks t WHERE t.user_id = u.id AND t.deleted_at IS NULL) AS live,
         (SELECT n.body FROM account_notes n WHERE n.user_id = u.id ORDER BY n.created_at DESC, n.id DESC LIMIT 1) AS note
       FROM users u WHERE ${where}
       ORDER BY u.created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${(o.page - 1) * PAGE_SIZE}`,
      ...args,
    ),
  ]);
  const total = Number(counts?.[o.view] ?? 0);
  return {
    total,
    counts: Object.fromEntries(VIEW_KEYS.map((k) => [k, Number(counts?.[k] ?? 0)])) as Record<View, number>,
    rows: rows.map(
      (u): CrmRow => ({
        id: u.id,
        name: u.name,
        handle: u.handle,
        email: o.showEmail ? u.email : null,
        plan: u.plan,
        kind: KIND_LABEL[u.kind ?? ""] ?? "—",
        tags: u.admin_tags ? u.admin_tags.split(",").filter(Boolean) : [],
        status: statusOf({ suspended: !!u.suspended_at, confirmed: !!u.email_verified_at }),
        note: (u.note ?? "").slice(0, 280),
        live: Number(u.live),
        joined: new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        twoFactor: !!u.totp_enabled_at,
      }),
    ),
  };
}
