import { requireAdmin } from "@/lib/admin";
import { ConfirmButton } from "../AdminUi";
import { q } from "@/lib/db";
import { env } from "@/lib/env";
import { createInvite, inviteByEmail, resendInvite, revokeInvite } from "../actions";

export default async function Invites({ searchParams }: { searchParams: Promise<{ sent?: string; skipped?: string }> }) {
  await requireAdmin("invites");
  const sp = await searchParams;
  const rows = await q.all<{
    code: string; max_uses: number; note: string; email: string | null; sent_at: number | null; created_at: number; revoked_at: number | null; used: number; joined: string | null;
  }>(
    `SELECT i.*, (SELECT COUNT(*) FROM users u WHERE u.invite_code = i.code) AS used,
       (SELECT u.handle FROM users u WHERE u.invite_code = i.code ORDER BY u.created_at LIMIT 1) AS joined
     FROM invites i ORDER BY i.created_at DESC LIMIT 1000`,
  );
  const legacy = await Promise.all(
    env.inviteCodes.map(async (code) => ({ code, used: await q.count("SELECT COUNT(*) AS n FROM users WHERE invite_code = ?", code) })),
  );
  // Revoked invites (cancelled by hand, or swapped for a new code by Resend) move to their own list under each table.
  const personal = rows.filter((r) => r.email && !r.revoked_at);
  const shared = rows.filter((r) => !r.email && !r.revoked_at);
  const revoked = rows.filter((r) => r.revoked_at);

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-bold tracking-tight">Invites</h1>

      {sp.sent !== undefined && (
        <p role="status" className="rounded-md border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          Sent {sp.sent} invite{sp.sent === "1" ? "" : "s"}.
          {Number(sp.skipped) > 0 && ` Skipped ${sp.skipped}: not a valid email, already has an account, or already has a pending invite.`}
        </p>
      )}

      <section aria-labelledby="email-h" className="space-y-4">
        <div>
          <h2 id="email-h" className="text-lg font-semibold">Invite by email</h2>
          <p className="mt-1 text-sm text-mute">Each person gets their own single-use code, which only works with their email address.</p>
        </div>
        <form action={inviteByEmail} className="grid gap-3 rounded-md border border-line p-5">
          <label className="block space-y-1.5">
            <span className="label">Emails (one per line, or separated by commas)</span>
            <textarea name="emails" required rows={3} className="input resize-y" placeholder={"dj@example.com\nlabel@example.com"} />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Personal note (optional, included in the email)</span>
            <input name="note" className="input" placeholder="Loved your set at…" maxLength={300} />
          </label>
          <button className="btn-lime btn-sm w-fit">Send invites</button>
        </form>

        {personal.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-mute">
                <tr>{["Email", "Status", "Code", "Sent", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {personal.map((r) => (
                  <tr key={r.code}>
                    <td className="px-4 py-3">{r.email}</td>
                    <td className="px-4 py-3">
                      {r.used ? (
                        <span className="chip border-lime/50 text-lime">Joined @{r.joined}</span>
                      ) : (
                        <span className="chip border-line text-mute">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-mute">{r.code}</td>
                    <td className="px-4 py-3 text-mute">{new Date(r.sent_at ?? r.created_at).toLocaleDateString("en-GB")}</td>
                    <td className="space-x-3 whitespace-nowrap px-4 py-3 text-right">
                      {!r.used && (
                        <>
                          <ConfirmButton action={resendInvite.bind(null, r.code)} message={`Email the invite to ${r.email} again?`} className="text-sm text-mute hover:text-bone">
                            Resend
                          </ConfirmButton>
                          <ConfirmButton action={revokeInvite.bind(null, r.code)} message={`Revoke ${r.email}'s invite?`} className="text-sm text-danger hover:underline">
                            Revoke
                          </ConfirmButton>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="codes-h" className="space-y-4">
        <div>
          <h2 id="codes-h" className="text-lg font-semibold">Shared codes</h2>
          <p className="mt-1 text-sm text-mute">One code for a group, like a collective or a class, with a cap on sign-ups. While Open sign-up is off, shared codes (and referral codes) don&apos;t open accounts: only a personal invite to that email does.</p>
        </div>
        <form action={createInvite} className="grid gap-3 rounded-md border border-line p-5 sm:grid-cols-[1fr_120px_1fr_auto] sm:items-end">
          <label className="block space-y-1.5">
            <span className="label">Code (blank = random)</span>
            <input name="code" className="input uppercase" placeholder="FLOOR-XXXXX" />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Max uses</span>
            <input name="max_uses" type="number" min={1} defaultValue={25} className="input" />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Note (who it&apos;s for)</span>
            <input name="note" className="input" placeholder="e.g. Accra DJ collective" />
          </label>
          <button className="btn-lime btn-sm">Create code</button>
        </form>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-mute">
              <tr>{["Code", "Used", "Note", "Created", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shared.map((r) => (
                <tr key={r.code}>
                  <td className="px-4 py-3">{r.code}</td>
                  <td className="px-4 py-3 tnum">{r.used} / {r.max_uses}</td>
                  <td className="px-4 py-3">{r.note}</td>
                  <td className="px-4 py-3 text-mute">{new Date(r.created_at).toLocaleDateString("en-GB")}</td>
                  <td className="px-4 py-3 text-right">
                    <ConfirmButton action={revokeInvite.bind(null, r.code)} message={`Revoke ${r.code}? Nobody new can sign up with it.`} className="text-sm text-danger hover:underline">
                      Revoke
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
              {legacy.map((r) => (
                <tr key={r.code} className="text-mute">
                  <td className="px-4 py-3">{r.code} <span className="chip ml-2 border-line">From Vercel settings</span></td>
                  <td className="px-4 py-3 tnum">{r.used} / {env.inviteLimit}</td>
                  <td className="px-4 py-3">Remove from BETA_INVITE_CODES to revoke</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                </tr>
              ))}
            </tbody>
          </table>
          {!shared.length && !legacy.length && <p className="p-6 text-mute">No shared codes yet.</p>}
        </div>
      </section>

      {revoked.length > 0 && (
        <details className="group rounded-md border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between px-5 py-3 text-sm font-semibold">
            Revoked ({revoked.length})
            <span className="text-mute group-open:hidden">Show</span>
            <span className="hidden text-mute group-open:inline">Hide</span>
          </summary>
          <p className="px-5 pb-3 text-sm text-mute">Cancelled invites, and old codes Resend replaced with a new one. They can&apos;t open an account or the coming-soon page. Kept for the record.</p>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full text-left text-sm text-mute">
              <thead className="border-b border-line">
                <tr>{["Email or note", "Code", "Revoked"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {revoked.map((r) => (
                  <tr key={r.code}>
                    <td className="px-4 py-3">{r.email ?? r.note}</td>
                    <td className="px-4 py-3">{r.code}</td>
                    <td className="px-4 py-3">{new Date(r.revoked_at!).toLocaleDateString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
