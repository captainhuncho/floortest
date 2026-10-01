import { q } from "@/lib/db";

export default async function AdminLog() {
  const rows = await q.all<{ id: number; action: string; target: string; detail: string; created_at: number; admin: string | null }>(
    `SELECT l.id, l.action, l.target, l.detail, l.created_at, u.email AS admin FROM admin_log l LEFT JOIN users u ON u.id = l.admin_id
     ORDER BY l.created_at DESC LIMIT 300`,
  );
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Admin log</h1>
      <p className="mt-2 text-mute">Every change made from the admin area, newest first.</p>
      <ul className="mt-6 divide-y divide-line rounded-md border border-line text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-3">
            <span>
              <span className="font-medium">{r.action.charAt(0).toUpperCase() + r.action.slice(1)}</span> {r.target} {r.detail && <span className="text-mute">· {r.detail}</span>}
            </span>
            <span className="text-mute">{r.admin ?? "deleted admin"} · {new Date(r.created_at).toLocaleString("en-GB")}</span>
          </li>
        ))}
        {!rows.length && <li className="px-4 py-3 text-mute">No admin actions yet.</li>}
      </ul>
    </div>
  );
}
