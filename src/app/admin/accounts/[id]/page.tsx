import Link from "next/link";
import { notFound } from "next/navigation";
import { AUDIT_LABELS, type AuditAction } from "@/lib/audit";
import { q } from "@/lib/db";
import { fmtBytes } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { ConfirmButton } from "../../../dashboard/ClientBits";
import { resetTwoFactor, setPlanFor, signOutEverywhere, startViewAs, suspendAccount, unsuspendAccount } from "../../actions";

export default async function Account({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) notFound();
  const u = await q.get<{
    id: number; name: string; handle: string; email: string; plan: string; created_at: number; tz: string;
    suspended_at: number | null; suspended_reason: string; totp_enabled_at: number | null; email_verified_at: number | null;
    invite_code: string | null; referred_by: number | null;
  }>(
    "SELECT id, name, handle, email, plan, created_at, tz, suspended_at, suspended_reason, totp_enabled_at, email_verified_at, invite_code, referred_by FROM users WHERE id = ?",
    id,
  );
  if (!u) notFound();
  const [live, all, bytes, senders, sessions] = await Promise.all([
    q.count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL", id),
    q.count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ?", id),
    q.get<{ n: number | null }>("SELECT SUM(size) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND file_key IS NOT NULL", id),
    q.count("SELECT COUNT(*) AS n FROM senders WHERE user_id = ?", id),
    q.count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?", id, Date.now()),
  ]);
  const log = await q.all<{ id: number; action: AuditAction; detail: string; created_at: number }>(
    "SELECT id, action, detail, created_at FROM account_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 15",
    id,
  );
  const facts = [
    ["Email", `${u.email}${u.email_verified_at ? "" : " (unconfirmed)"}`],
    ["Link", `${APP_URL.replace(/^https?:\/\//, "")}/${u.handle}`],
    ["Joined", new Date(u.created_at).toLocaleString("en-GB")],
    ["Invite", u.invite_code ?? (u.referred_by ? `referral from #${u.referred_by}` : "none")],
    ["Tracks", `${live} on file · ${all} ever · ${fmtBytes(bytes?.n ?? 0)}`],
    ["Senders", String(senders)],
    ["Security", `${u.totp_enabled_at ? "Two-factor on" : "Password only"} · ${sessions} active session${sessions === 1 ? "" : "s"}`],
  ];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/accounts" className="text-sm text-mute hover:text-bone">← Users</Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {u.name} <span className="text-mute">@{u.handle}</span>
          {u.suspended_at && <span className="chip ml-3 align-middle border-danger/50 text-danger">Suspended</span>}
        </h1>
        {u.suspended_at && <p className="mt-2 text-sm text-danger">Suspended {new Date(u.suspended_at).toLocaleString("en-GB")}{u.suspended_reason ? `: ${u.suspended_reason}` : ""}</p>}
      </div>

      <dl className="grid gap-x-8 gap-y-3 rounded-md border border-line p-5 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="label">{k}</dt>
            <dd className="mt-0.5 break-words">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Actions</h2>
        <div className="flex flex-wrap items-center gap-2">
          <form action={startViewAs.bind(null, id)}>
            <button className="btn-lime btn-sm">View their desk (read-only)</button>
          </form>
          <form action={async (fd: FormData) => { "use server"; await setPlanFor(id, String(fd.get("plan"))); }} className="flex gap-2">
            <select name="plan" defaultValue={u.plan} className="input w-32" aria-label="Plan">
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
            </select>
            <button className="btn-ghost btn-sm">Set plan</button>
          </form>
          <ConfirmButton action={signOutEverywhere.bind(null, id)} message={`Sign @${u.handle} out of every device?`} className="btn-ghost btn-sm">
            Sign out everywhere
          </ConfirmButton>
          {u.totp_enabled_at && (
            <ConfirmButton
              action={resetTwoFactor.bind(null, id)}
              message={`Turn off two-factor for @${u.handle}? Only do this after confirming who they are. They'll be signed out.`}
              className="btn-ghost btn-sm"
            >
              Reset two-factor
            </ConfirmButton>
          )}
        </div>
        {u.suspended_at ? (
          <ConfirmButton action={unsuspendAccount.bind(null, id)} message={`Restore @${u.handle}? Their link and sign-in come back.`} className="btn-lime btn-sm">
            Unsuspend
          </ConfirmButton>
        ) : (
          <form
            action={async (fd: FormData) => { "use server"; await suspendAccount(id, String(fd.get("reason") || "")); }}
            className="flex flex-wrap items-end gap-2 rounded-md border border-danger/30 p-4"
          >
            <label className="block flex-1 space-y-1.5">
              <span className="label">Suspend: reason (kept in the admin log)</span>
              <input name="reason" className="input" placeholder="e.g. spam uploads" required />
            </label>
            <button className="btn-sm rounded-md border border-danger/50 px-4 text-danger hover:bg-danger/10">Suspend account</button>
          </form>
        )}
        <p className="text-xs text-mute">Suspending signs them out, blocks sign-in and takes their public link offline. Nothing is deleted.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Recent account activity</h2>
        <ul className="mt-3 divide-y divide-line rounded-md border border-line text-sm">
          {log.map((r) => (
            <li key={r.id} className="flex justify-between gap-4 px-4 py-2.5">
              <span>{AUDIT_LABELS[r.action] ?? r.action} <span className="text-mute">{r.detail}</span></span>
              <span className="shrink-0 text-mute">{new Date(r.created_at).toLocaleString("en-GB")}</span>
            </li>
          ))}
          {!log.length && <li className="px-4 py-3 text-mute">Nothing recorded yet.</li>}
        </ul>
      </section>
    </div>
  );
}
