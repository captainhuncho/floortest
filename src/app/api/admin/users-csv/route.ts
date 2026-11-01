import { requireAdminAction, logAdmin } from "@/lib/admin";
import { audienceWhere, describeAudience, readAudience } from "@/lib/audience";
import { csvCell } from "@/lib/csv";
import { likeContains, q, KIND_LABEL } from "@/lib/db";
import { readSecurity, SECURITY, securityWhere } from "@/lib/admin-bulk";

export const runtime = "nodejs";

/** Admin → Users → Export CSV: the filtered list, for outreach in a spreadsheet. Logged, since it contains emails. */
export async function GET(req: Request) {
  const a = await requireAdminAction("super");
  const sp = new URL(req.url).searchParams;
  const aud = readAudience((k) => sp.get(k));
  const w = audienceWhere(aud, Date.now(), true);
  // The same Security filter and search as the Users list, so the file is the list on screen (1 Nov: both were
  // dropped and "Password only" exported every account).
  const security = readSecurity(sp.get("security") ?? undefined);
  const search = (sp.get("q") || "").trim().slice(0, 100);
  const where = `${w.sql} AND ${securityWhere(security)} ${search ? "AND (u.name ILIKE ? OR u.email ILIKE ? OR u.handle ILIKE ?)" : ""}`;
  const rows = await q.all<{ name: string; first_name: string; last_name: string; handle: string; email: string; kind: string | null; plan: string; admin_tags: string; notify_product: number; notify_marketing: number; created_at: number; last_active_at: number | null }>(
    `SELECT u.name, u.first_name, u.last_name, u.handle, u.email, u.kind, u.plan, u.admin_tags, u.notify_product, u.notify_marketing, u.created_at, u.last_active_at FROM users u WHERE ${where} ORDER BY u.created_at DESC LIMIT 10000`,
    ...w.args,
    ...(search ? Array(3).fill(likeContains(search)) : []),
  );
  const day = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 10) : "");
  const lines = [
    ["First name", "Surname", "Public name", "Link", "Email", "Type", "Plan", "Tags", "Newsletter", "Offers", "Joined", "Last active"],
    ...rows.map((r) => [r.first_name, r.last_name, r.name, r.handle, r.email, KIND_LABEL[r.kind ?? ""] ?? "", r.plan, r.admin_tags, r.notify_product ? "yes" : "no", r.notify_marketing ? "yes" : "no", day(r.created_at), day(r.last_active_at)]),
  ].map((l) => l.map(csvCell).join(","));
  const filters = [describeAudience(aud), security && SECURITY[security], search && `search “${search}”`].filter(Boolean).join(" · ");
  await logAdmin(a.id, "exported users", filters, `${rows.length} rows`);
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="floortest-users-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
