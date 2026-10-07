import { requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { env } from "@/lib/env";
import { parsePerms, PERMS, ROLE_PERMS, ROLES, SUPER_ONLY, type Perm, type Role } from "@/lib/ops-perms";
import { ConfirmButton } from "../AdminUi";
import { addOpsMember, saveOpsMember, setOpsMemberDisabled } from "../actions";

type Member = { user_id: number; name: string; email: string; handle: string; role: Role; grant_perms: string; deny_perms: string; disabled_at: number | null; created_at: number; totp: number | null; last_seen: number | null };

/** The ops team: who can sign in to ops, with which role, and anything added or taken away for them. */
export default async function OpsTeam() {
  await requireAdmin("super");
  const members = await q.all<Member>(
    `SELECT m.user_id, u.name, u.email, u.handle, m.role, m.grant_perms, m.deny_perms, m.disabled_at, m.created_at, u.totp_enabled_at AS totp,
       (SELECT MAX(s.last_seen_at) FROM admin_sessions s WHERE s.user_id = m.user_id) AS last_seen
     FROM ops_members m JOIN users u ON u.id = m.user_id ORDER BY m.disabled_at IS NOT NULL, m.created_at`,
  );
  const allPerms = Object.keys(PERMS) as Perm[];
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ops team</h1>
        <p className="mt-2 max-w-2xl text-mute">
          People who can sign in to ops, and what each can open. Super admins are set by ADMIN_EMAILS ({env.adminEmails.length}) and can&apos;t be removed here.
        </p>
      </div>

      <form action={addOpsMember} className="grid gap-3 rounded-lg border border-line p-5 sm:grid-cols-[1fr_220px_auto] sm:items-end">
        <label className="grid gap-1 text-sm">
          <span className="label">Their FloorTest account email</span>
          <input name="email" type="email" required className="input" placeholder="name@floortest.app" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="label">Role</span>
          <select name="role" required className="input" defaultValue="care">
            {(Object.keys(ROLES) as Role[]).map((r) => (
              <option key={r} value={r}>{ROLES[r]}</option>
            ))}
          </select>
        </label>
        <button className="btn-lime btn-sm h-11">Add to team</button>
        <p className="text-xs text-mute sm:col-span-3">They need a confirmed FloorTest account, and two-step sign-in on before ops will let them in.</p>
      </form>

      {members.length === 0 ? (
        <p className="text-mute">Nobody else yet.</p>
      ) : (
        <ul className="space-y-4">
          {members.map((m) => {
            const deny = new Set(parsePerms(m.deny_perms));
            const effective = new Set([...ROLE_PERMS[m.role], ...parsePerms(m.grant_perms)].filter((p) => !deny.has(p)));
            const defaults = new Set(ROLE_PERMS[m.role]);
            return (
              <li key={m.user_id} className={`rounded-lg border border-line p-5 ${m.disabled_at ? "opacity-60" : ""}`}>
                <form action={saveOpsMember.bind(null, m.user_id)} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        {m.name} <span className="font-normal text-mute">@{m.handle} · {m.email}</span>
                      </p>
                      <p className="text-xs text-mute">
                        {m.disabled_at ? "No access" : "Active"} · {m.totp ? "two-step on" : <span className="text-danger">two-step off: can&apos;t sign in yet</span>} ·{" "}
                        {m.last_seen ? `last in ops ${new Date(Number(m.last_seen)).toLocaleString("en-GB")}` : "hasn't signed in yet"}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="label">Role</span>
                      <select name="role" defaultValue={m.role} className="input py-1.5">
                        {(Object.keys(ROLES) as Role[]).map((r) => (
                          <option key={r} value={r}>{ROLES[r]}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <fieldset>
                    <legend className="label mb-2">Can open (role defaults marked •)</legend>
                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                      {allPerms.map((p) => (
                        <label key={p} className="flex items-center gap-2 py-1 text-sm">
                          <input type="checkbox" name="perm" value={p} defaultChecked={effective.has(p)} className="size-4 accent-lime" />
                          {PERMS[p]}
                          {defaults.has(p) && <span aria-label="role default" className="text-lime">•</span>}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex flex-wrap items-center gap-3">
                    <button className="btn-lime btn-sm">Save access</button>
                    <span className="text-xs text-mute">Changing the role resets the boxes to that role&apos;s defaults.</span>
                  </div>
                </form>
                <div className="mt-3 border-t border-line pt-3">
                  {m.disabled_at ? (
                    <ConfirmButton action={setOpsMemberDisabled.bind(null, m.user_id, false)} message={`Give @${m.handle} ops access again?`} className="btn-ghost btn-sm">
                      Restore access
                    </ConfirmButton>
                  ) : (
                    <ConfirmButton action={setOpsMemberDisabled.bind(null, m.user_id, true)} message={`Remove @${m.handle}'s ops access? They're signed out of ops at once.`} confirmLabel="Remove access" danger className="btn-ghost btn-sm text-danger">
                      Remove access
                    </ConfirmButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="rounded-lg border border-line bg-ink-2 p-5">
        <h2 className="font-bold">Only super admins can</h2>
        <ul className="mt-2 grid gap-1 text-sm text-mute sm:grid-cols-2">
          {SUPER_ONLY.map((x) => (
            <li key={x}>· {x}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
