import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { likeContains, q } from "@/lib/db";

export const metadata = { title: "Admin log — FloorTest admin" };

const PAGE = 100;
type Row = { id: number; action: string; target: string; detail: string; created_at: number; admin_id: number | null; admin: string | null };

/** Every change made from the admin area: filter by admin or action, search, and jump to the account each one was about. */
export default async function AdminLog({ searchParams }: { searchParams: Promise<{ admin?: string; action?: string; q?: string; before?: string }> }) {
  await requireAdmin("super");
  const sp = await searchParams;
  const adminId = Number(sp.admin) || null;
  const action = (sp.action ?? "").slice(0, 80) || null;
  const search = (sp.q ?? "").trim().slice(0, 100);
  const before = Number(sp.before) || null;

  const where: string[] = [];
  const args: (string | number)[] = [];
  if (adminId) (where.push("l.admin_id = ?"), args.push(adminId));
  if (action) (where.push("l.action = ?"), args.push(action));
  if (search) (where.push("(l.target ILIKE ? OR l.detail ILIKE ? OR l.action ILIKE ?)"), args.push(...Array(3).fill(likeContains(search))));
  if (before) (where.push("l.id < ?"), args.push(before));
  const rows = await q.all<Row>(
    `SELECT l.id, l.action, l.target, l.detail, l.created_at, l.admin_id, u.email AS admin FROM admin_log l LEFT JOIN users u ON u.id = l.admin_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY l.id DESC LIMIT ${PAGE + 1}`,
    ...args,
  );
  const more = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);
  const [admins, actions] = await Promise.all([
    q.all<{ id: number; email: string }>("SELECT DISTINCT u.id, u.email FROM admin_log l JOIN users u ON u.id = l.admin_id ORDER BY u.email"),
    q.all<{ action: string; n: number }>("SELECT action, COUNT(*)::int AS n FROM admin_log GROUP BY action ORDER BY action"),
  ]);

  // Targets that name an account (@handle or an email) link to it.
  const handles = [...new Set(shown.map((r) => r.target.match(/^@([a-z0-9_-]+)/)?.[1]).filter((h): h is string => !!h))];
  const emails = [...new Set(shown.map((r) => r.target.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)?.[0]?.toLowerCase()).filter((e): e is string => !!e))];
  const byHandle = new Map(
    (handles.length ? await q.all<{ id: number; handle: string }>(`SELECT id, handle FROM users WHERE handle IN (${handles.map(() => "?").join(",")})`, ...handles) : []).map((u) => [u.handle, u.id]),
  );
  const byEmail = new Map(
    (emails.length ? await q.all<{ id: number; email: string }>(`SELECT id, lower(email) AS email FROM users WHERE lower(email) IN (${emails.map(() => "?").join(",")})`, ...emails) : []).map((u) => [u.email, u.id]),
  );
  const accountFor = (target: string) => byHandle.get(target.match(/^@([a-z0-9_-]+)/)?.[1] ?? "") ?? byEmail.get(target.toLowerCase());
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ admin: adminId ? String(adminId) : null, action, q: search || null, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/log${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin log</h1>
        <p className="mt-2 text-mute">Every change made from the admin area, newest first. Kept for the record; entries can&apos;t be edited or deleted.</p>
      </div>
      <form action="/admin/log" className="flex flex-wrap items-end gap-3" role="search">
        <label className="block space-y-1">
          <span className="label">Search</span>
          <input name="q" defaultValue={search} placeholder="@handle, email, #id…" className="input w-56" />
        </label>
        <label className="block space-y-1">
          <span className="label">Action</span>
          <select name="action" defaultValue={action ?? ""} className="input w-56">
            <option value="">Every action</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>
                {a.action} ({a.n})
              </option>
            ))}
          </select>
        </label>
        {admins.length > 1 && (
          <label className="block space-y-1">
            <span className="label">Admin</span>
            <select name="admin" defaultValue={adminId ? String(adminId) : ""} className="input w-56">
              <option value="">Every admin</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="btn-ghost btn-sm">Filter</button>
        {(search || action || adminId) && (
          <Link href="/admin/log" className="text-sm text-mute underline underline-offset-4 hover:text-bone">
            Clear
          </Link>
        )}
      </form>
      <ul className="divide-y divide-line rounded-md border border-line text-sm">
        {shown.map((r) => {
          const acct = accountFor(r.target);
          return (
            <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-3">
              <span className="min-w-0">
                <Link href={href({ action: r.action, before: null })} className="font-medium hover:underline">
                  {r.action.charAt(0).toUpperCase() + r.action.slice(1)}
                </Link>{" "}
                {acct ? (
                  <Link href={`/admin/accounts/${acct}`} className="underline underline-offset-4 hover:text-bone">
                    {r.target}
                  </Link>
                ) : (
                  r.target
                )}{" "}
                {r.detail && <span className="text-mute">· {r.detail}</span>}
              </span>
              <span className="text-mute">
                {r.admin ?? "deleted admin"} · {new Date(r.created_at).toLocaleString("en-GB")}
              </span>
            </li>
          );
        })}
        {!shown.length && <li className="px-4 py-3 text-mute">{search || action || adminId ? "Nothing matches." : "No admin actions yet."}</li>}
      </ul>
      {more && (
        <Link href={href({ before: String(shown[shown.length - 1].id) })} className="btn-ghost btn-sm">
          Older entries
        </Link>
      )}
    </div>
  );
}
