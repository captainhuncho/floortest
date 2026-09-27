import Link from "next/link";
import { likeContains, q } from "@/lib/db";

export default async function Accounts({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const search = ((await searchParams).q || "").trim().slice(0, 100);
  const rows = await q.all<{
    id: number; name: string; handle: string; email: string; plan: string; created_at: number;
    suspended_at: number | null; totp_enabled_at: number | null; email_verified_at: number | null; live: number;
  }>(
    `SELECT u.id, u.name, u.handle, u.email, u.plan, u.created_at, u.suspended_at, u.totp_enabled_at, u.email_verified_at,
       (SELECT COUNT(*) FROM tracks t WHERE t.user_id = u.id AND t.deleted_at IS NULL) AS live
     FROM users u ${search ? "WHERE u.name ILIKE ? OR u.email ILIKE ? OR u.handle ILIKE ?" : ""}
     ORDER BY u.created_at DESC LIMIT 200`,
    ...(search ? Array(3).fill(likeContains(search)) : []),
  );
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={search} placeholder="Name, email or link" className="input w-64" aria-label="Search accounts" />
          <button className="btn-ghost btn-sm">Search</button>
        </form>
      </div>
      <div className="mt-6 overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-mute">
            <tr>
              {["Receiver", "Email", "Plan", "Tracks", "Security", "Joined"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-ink-2">
                <td className="px-4 py-3">
                  <Link href={`/admin/accounts/${u.id}`} className="font-medium hover:underline">{u.name}</Link>
                  <span className="text-mute"> @{u.handle}</span>
                  {u.suspended_at && <span className="chip ml-2 border-danger/50 text-danger">Suspended</span>}
                </td>
                <td className="px-4 py-3 text-mute">{u.email}{!u.email_verified_at && <span className="ml-1 text-danger">(unconfirmed)</span>}</td>
                <td className="px-4 py-3 capitalize">{u.plan}</td>
                <td className="px-4 py-3 tnum">{u.live}</td>
                <td className="px-4 py-3 text-mute">{u.totp_enabled_at ? "2FA on" : "Password only"}</td>
                <td className="px-4 py-3 text-mute">{new Date(u.created_at).toLocaleDateString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-mute">No accounts match.</p>}
      </div>
    </div>
  );
}
