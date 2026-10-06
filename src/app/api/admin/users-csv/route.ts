import { requireAdminAction, logAdmin } from "@/lib/admin";
import { audienceWhere, describeAudience, readAudience } from "@/lib/audience";
import { q, KIND_LABEL } from "@/lib/db";

export const runtime = "nodejs";

/** Admin → Users → Export CSV: the filtered list, for outreach in a spreadsheet. Logged, since it contains emails. */
export async function GET(req: Request) {
  const a = await requireAdminAction();
  const sp = new URL(req.url).searchParams;
  const aud = readAudience((k) => sp.get(k));
  const w = audienceWhere(aud, Date.now(), true);
  const rows = await q.all<{ name: string; handle: string; email: string; kind: string | null; plan: string; admin_tags: string; notify_product: number; notify_marketing: number; created_at: number; last_active_at: number | null }>(
    `SELECT u.name, u.handle, u.email, u.kind, u.plan, u.admin_tags, u.notify_product, u.notify_marketing, u.created_at, u.last_active_at FROM users u WHERE ${w.sql} ORDER BY u.created_at DESC LIMIT 10000`,
    ...w.args,
  );
  // Quote every cell; a leading = + - @ is neutralised so a spreadsheet can't run it as a formula.
  const cell = (v: unknown) => `"${String(v ?? "").replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const day = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 10) : "");
  const lines = [
    ["Name", "Link", "Email", "Type", "Plan", "Tags", "Newsletter", "Offers", "Joined", "Last active"],
    ...rows.map((r) => [r.name, r.handle, r.email, KIND_LABEL[r.kind ?? ""] ?? "", r.plan, r.admin_tags, r.notify_product ? "yes" : "no", r.notify_marketing ? "yes" : "no", day(r.created_at), day(r.last_active_at)]),
  ].map((l) => l.map(cell).join(","));
  await logAdmin(a.id, "exported users", describeAudience(aud), `${rows.length} rows`);
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="floortest-users-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
