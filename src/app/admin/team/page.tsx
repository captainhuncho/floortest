import { requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { parsePerms, PERMS, ROLE_PERMS, ROLES, SUPER_ONLY, type Perm, type Role } from "@/lib/ops-perms";
import { ConfirmButton } from "../AdminUi";
import { addOpsMember, saveOpsMember, setOpsMemberDisabled } from "../actions";
import { Avatar, PageHead, StatusPill } from "../PinParts";

type Member = { user_id: number; name: string; email: string; handle: string; role: Role; grant_perms: string; deny_perms: string; disabled_at: number | null; created_at: number; totp: number | null; last_seen: number | null };

const COLS = "md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_130px_150px_150px_76px]";

const lastIn = (ms: number | null) => {
  if (!ms) return "Not yet";
  const d = new Date(Number(ms));
  const today = new Date().toDateString() === d.toDateString();
  return today ? `Today at ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/**
 * The ops team, laid out like pin 107 (owner, 1 Nov): one table of people with an avatar, email, a status pill,
 * role and when they were last in, and an add bar on top. Edit opens the row to change the role and what they can open.
 */
export default async function OpsTeam() {
  await requireAdmin("super");
  const members = await q.all<Member>(
    `SELECT m.user_id, u.name, u.email, u.handle, m.role, m.grant_perms, m.deny_perms, m.disabled_at, m.created_at, u.totp_enabled_at AS totp,
       (SELECT MAX(s.last_seen_at) FROM admin_sessions s WHERE s.user_id = m.user_id) AS last_seen
     FROM ops_members m JOIN users u ON u.id = m.user_id ORDER BY m.disabled_at IS NOT NULL, m.created_at`,
  );
  const allPerms = Object.keys(PERMS) as Perm[];
  const active = members.filter((m) => !m.disabled_at).length;
  return (
    <div className="space-y-6">
      <PageHead eyebrow="People" title="Ops team">
        People who can sign in to ops, and what each can open.
      </PageHead>

      <section aria-label="Team members" className="admin-panel admin-rise p-4 sm:p-5" style={{ "--i": 1 } as React.CSSProperties}>
        {/* Pin 107's toolbar: the count on the left, the add controls on the right. */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-[13px] text-mute tnum">
            {members.length} {members.length === 1 ? "person" : "people"} · {active} with access
          </p>
          <form action={addOpsMember} className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
            <label className="min-w-0 flex-1 basis-60 lg:w-64 lg:flex-none">
              <span className="sr-only">Their FloorTest account email</span>
              <input name="email" type="email" required className="input min-h-11 w-full rounded-full" placeholder="Their FloorTest email" />
            </label>
            <label className="basis-44 lg:w-48 lg:flex-none">
              <span className="sr-only">Role</span>
              <select name="role" required className="input min-h-11 w-full rounded-full" defaultValue="care">
                {(Object.keys(ROLES) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLES[r]}
                  </option>
                ))}
              </select>
            </label>
            <button className="admin-press inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-lime px-5 text-[13.5px] font-semibold text-ink">
              <span aria-hidden className="text-[16px] leading-none">+</span> Add member
            </button>
          </form>
        </div>
        <p className="mt-2 text-right text-[12px] text-faint">They need a confirmed FloorTest account, and two-step sign-in on before ops will let them in.</p>

        <div className="mt-4 overflow-hidden rounded-[16px] ring-1 ring-line">
          <div aria-hidden className={`hidden gap-4 bg-ink-3 px-4 py-3 text-[12px] font-semibold text-faint md:grid ${COLS}`}>
            <span>Name</span>
            <span>Email</span>
            <span>Status</span>
            <span>Role</span>
            <span>Last in ops</span>
            <span className="text-right">Actions</span>
          </div>
          {members.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] text-mute">Nobody else yet.</p>
          ) : (
            <ul>
              {members.map((m, i) => {
                const deny = new Set(parsePerms(m.deny_perms));
                const effective = new Set([...ROLE_PERMS[m.role], ...parsePerms(m.grant_perms)].filter((p) => !deny.has(p)));
                const defaults = new Set(ROLE_PERMS[m.role]);
                const [state, tone] = m.disabled_at ? (["No access", "danger"] as const) : !m.totp ? (["Two-step off", "amber"] as const) : (["Active", "lime"] as const);
                return (
                  <li key={m.user_id} className="admin-rise border-t border-line first:border-t-0 md:first:border-t" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                    <details className="group">
                      <summary className={`grid cursor-pointer list-none items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-ink-3/50 [&::-webkit-details-marker]:hidden ${COLS} ${m.disabled_at ? "opacity-60" : ""}`}>
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar name={m.name || m.handle} />
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-semibold">{m.name}</span>
                            <span className="block truncate text-[12px] text-faint">@{m.handle}</span>
                          </span>
                        </span>
                        <span className="truncate text-[13px] text-mute">{m.email}</span>
                        <span>
                          <StatusPill tone={tone}>{state}</StatusPill>
                        </span>
                        <span className="text-[13px]">{ROLES[m.role]}</span>
                        <span className="text-[13px] text-mute">{lastIn(m.last_seen)}</span>
                        <span className="flex md:justify-end">
                          <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold ring-1 ring-line-2 group-open:bg-bone group-open:text-ink">
                            <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                            </svg>
                            <span className="group-open:hidden">Edit</span>
                            <span className="hidden group-open:inline">Close</span>
                          </span>
                        </span>
                      </summary>
                      <div className="border-t border-line bg-ink-3/40 px-4 py-4">
                        <form action={saveOpsMember.bind(null, m.user_id)} className="space-y-4">
                          <label className="flex flex-wrap items-center gap-3 text-[13px]">
                            <span className="label">Role</span>
                            <select name="role" defaultValue={m.role} className="input min-h-11 w-auto rounded-full">
                              {(Object.keys(ROLES) as Role[]).map((r) => (
                                <option key={r} value={r}>
                                  {ROLES[r]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <fieldset>
                            <legend className="label mb-2">Can open (role defaults marked •)</legend>
                            <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                              {allPerms.map((p) => (
                                <label key={p} className="flex min-h-11 items-center gap-2.5 text-[13.5px]">
                                  <input type="checkbox" name="perm" value={p} defaultChecked={effective.has(p)} className="size-4 accent-lime" />
                                  {PERMS[p]}
                                  {defaults.has(p) && (
                                    <span aria-label="role default" className="text-lime">
                                      •
                                    </span>
                                  )}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                          <div className="flex flex-wrap items-center gap-3">
                            <button className="admin-press inline-flex min-h-11 items-center rounded-full bg-lime px-5 text-[13.5px] font-semibold text-ink">Save access</button>
                            <span className="text-[12px] text-faint">Changing the role resets the boxes to that role&apos;s defaults.</span>
                          </div>
                        </form>
                        <div className="mt-4 border-t border-line pt-4">
                          {m.disabled_at ? (
                            <ConfirmButton action={setOpsMemberDisabled.bind(null, m.user_id, false)} message={`Give @${m.handle} ops access again?`} className="admin-press inline-flex min-h-11 items-center rounded-full px-5 text-[13.5px] font-semibold ring-1 ring-line-2 hover:bg-ink-3">
                              Restore access
                            </ConfirmButton>
                          ) : (
                            <ConfirmButton
                              action={setOpsMemberDisabled.bind(null, m.user_id, true)}
                              message={`Remove @${m.handle}'s ops access? They're signed out of ops at once.`}
                              confirmLabel="Remove access"
                              danger
                              className="admin-press inline-flex min-h-11 items-center gap-1.5 rounded-full px-5 text-[13.5px] font-semibold text-danger ring-1 ring-danger/40 hover:bg-danger/10"
                            >
                              Remove access
                            </ConfirmButton>
                          )}
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <details className="admin-panel admin-rise group" style={{ "--i": 2 } as React.CSSProperties}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 [&::-webkit-details-marker]:hidden">
          <span className="text-[15px] font-semibold">Only super admins can</span>
          <span aria-hidden className="text-faint transition-transform duration-200 group-open:rotate-180">
            ▾
          </span>
        </summary>
        <ul className="grid gap-1 border-t border-line px-5 py-4 text-[13.5px] text-mute sm:grid-cols-2">
          {SUPER_ONLY.map((x) => (
            <li key={x}>· {x}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
