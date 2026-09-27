import { ConfirmButton } from "../../dashboard/ClientBits";
import { q } from "@/lib/db";
import { env } from "@/lib/env";
import { createInvite, revokeInvite } from "../actions";

export default async function Invites() {
  const rows = await q.all<{ code: string; max_uses: number; note: string; created_at: number; revoked_at: number | null; used: number }>(
    `SELECT i.*, (SELECT COUNT(*) FROM users u WHERE u.invite_code = i.code) AS used FROM invites i ORDER BY i.created_at DESC`,
  );
  const legacy = await Promise.all(
    env.inviteCodes.map(async (code) => ({ code, used: await q.count("SELECT COUNT(*) AS n FROM users WHERE invite_code = ?", code) })),
  );
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Invites</h1>
      <form action={createInvite} className="grid gap-3 rounded-md border border-line p-5 sm:grid-cols-[1fr_120px_1fr_auto] sm:items-end">
        <label className="block space-y-1.5">
          <span className="label">Code (blank = random)</span>
          <input name="code" className="input font-mono uppercase" placeholder="FLOOR-XXXXX" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Max uses</span>
          <input name="max_uses" type="number" min={1} defaultValue={25} className="input" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Note (who it&apos;s for)</span>
          <input name="note" className="input" placeholder="e.g. Accra DJ collective" />
        </label>
        <button className="btn-lime btn-sm">Create invite</button>
      </form>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-mute">
            <tr>{["Code", "Used", "Note", "Created", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.code} className={r.revoked_at ? "text-mute" : ""}>
                <td className="px-4 py-3 font-mono">{r.code}{r.revoked_at && <span className="chip ml-2 border-line">Revoked</span>}</td>
                <td className="px-4 py-3 tnum">{r.used} / {r.max_uses}</td>
                <td className="px-4 py-3">{r.note}</td>
                <td className="px-4 py-3 text-mute">{new Date(r.created_at).toLocaleDateString("en-GB")}</td>
                <td className="px-4 py-3 text-right">
                  {!r.revoked_at && (
                    <ConfirmButton action={revokeInvite.bind(null, r.code)} message={`Revoke ${r.code}? Nobody new can sign up with it.`} className="text-sm text-danger hover:underline">
                      Revoke
                    </ConfirmButton>
                  )}
                </td>
              </tr>
            ))}
            {legacy.map((r) => (
              <tr key={r.code} className="text-mute">
                <td className="px-4 py-3 font-mono">{r.code} <span className="chip ml-2 border-line">From Vercel settings</span></td>
                <td className="px-4 py-3 tnum">{r.used} / {env.inviteLimit}</td>
                <td className="px-4 py-3">Remove from BETA_INVITE_CODES to revoke</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !legacy.length && <p className="p-6 text-mute">No invite codes yet.</p>}
      </div>
    </div>
  );
}
