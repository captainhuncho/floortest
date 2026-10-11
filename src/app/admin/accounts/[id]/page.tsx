import { can, requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { KIND_LABEL } from "@/lib/db";
import { notFound } from "next/navigation";
import { AUDIT_LABELS, type AuditAction } from "@/lib/audit";
import { activeCollection, capacity, isClosed, isPaused } from "@/lib/desk";
import { q, type User } from "@/lib/db";
import { fmtBytes } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { planOf } from "@/lib/plan-store";
import { ConfirmButton } from "../../AdminUi";
import {
  adminCancelEmailChange,
  adminChangeEmail,
  adminChangeHandle,
  resendEmail,
  resetTwoFactor,
  setContactHandled,
  setPlanFor,
  setExtraSeatsFor,
  signOutEverywhere,
  startViewAs,
  suspendAccount,
  unsuspendAccount,
  addNote,
  saveTags,
} from "../../actions";

const day = (t: number) => new Date(t).toLocaleDateString("en-GB");
const when = (t: number) => new Date(t).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** User 360: everything about one account on one page, with every admin action in one place. */
export default async function Account({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin("users.read");
  const support = can(me.access, "users.support");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) notFound();
  const u = await q.get<User & { extra_seats: number; identity_status: string | null; invite_code: string | null; referred_by: number | null; suspended_at: number | null; suspended_reason: string; pending_email: string | null; pending_email_at: number | null; signup_source: string; admin_tags: string }>("SELECT * FROM users WHERE id = ?", id);
  const notes = await q.all<{ id: number; body: string; created_at: number; handle: string | null }>(
    "SELECT n.id, n.body, n.created_at, a.handle FROM account_notes n LEFT JOIN users a ON a.id = n.admin_id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50",
    id,
  );
  if (!u) notFound();
  const t = Date.now();
  const pendingEmail = u.pending_email && (u.pending_email_at ?? 0) > t - 48 * 3_600_000 ? u.pending_email : null;
  const oldHandles = await q.all<{ old_handle: string; forward: number; expires_at: number }>("SELECT old_handle, forward, expires_at FROM handle_history WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC", id, t);

  const [cap, collection, collections, all, bytes, sessions] = await Promise.all([
    capacity(u),
    activeCollection(u),
    q.count("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?", id),
    q.count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ?", id),
    q.get<{ n: number | null }>("SELECT SUM(size) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND file_key IS NOT NULL", id),
    q.count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?", id, t),
  ]);
  const senders = await q.all<{ id: number; name: string; email: string; blocked_at: number | null; tracks: number; last: number | null }>(
    `SELECT s.id, s.name, s.email, s.blocked_at, COUNT(tr.id)::int AS tracks, MAX(tr.created_at) AS last
     FROM senders s LEFT JOIN tracks tr ON tr.sender_id = s.id WHERE s.user_id = ? GROUP BY s.id ORDER BY s.blocked_at IS NULL, tracks DESC LIMIT 10`,
    id,
  );
  const senderTotal = await q.count("SELECT COUNT(*) AS n FROM senders WHERE user_id = ?", id);
  const emails = await q.all<{ id: number; subject: string; status: string; created_at: number }>(
    "SELECT id, subject, status, created_at FROM outbox WHERE user_id = ? OR lower(to_email) = lower(?) ORDER BY created_at DESC LIMIT 12",
    id,
    u.email,
  );
  const messages = await q.all<{ id: number; topic: string; message: string; created_at: number; handled_at: number | null }>(
    "SELECT id, topic, message, created_at, handled_at FROM contact_messages WHERE user_id = ? OR lower(email) = lower(?) ORDER BY created_at DESC LIMIT 10",
    id,
    u.email,
  );
  const history = await q.all<{ action: string; detail: string; created_at: number; admin: string | null }>(
    `SELECT l.action, l.detail, l.created_at, x.handle AS admin FROM admin_log l LEFT JOIN users x ON x.id = l.admin_id WHERE l.target = ?
     UNION ALL
     SELECT 'changed plan (by them)' AS action, a.detail, a.created_at, NULL AS admin FROM account_log a WHERE a.user_id = ? AND a.action = 'plan_changed'
     ORDER BY created_at DESC LIMIT 25`,
    `@${u.handle}`,
    id,
  );
  const log = await q.all<{ id: number; action: AuditAction; detail: string; created_at: number }>(
    "SELECT id, action, detail, created_at FROM account_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 15",
    id,
  );

  const link = !!u.suspended_at ? "Offline (suspended)" : isPaused(u) ? "Paused" : collection && isClosed(collection) ? "Closed" : cap.full ? "Full" : "Open";
  const chips: [string, boolean][] = [
    [u.email_verified_at ? "Email confirmed" : "Email unconfirmed", !!u.email_verified_at],
    [u.totp_enabled_at ? "Two-factor on" : "Password only", !!u.totp_enabled_at],
    [u.identity_status === "verified" ? "Verified" : u.identity_status === "pending" ? "Verification pending" : "Not verified", u.identity_status === "verified"],
  ];
  const usage = [
    ["Plan", (await planOf(u.plan)).name],
    ["Desk", `${cap.used} / ${cap.limit} tracks${cap.bonus ? ` (+${cap.bonus} bonus)` : ""}`],
    ["Storage", fmtBytes(bytes?.n ?? 0)],
    ["Link", link],
    ["Collections", `${collections}${collection ? ` · active: ${collection.name}` : ""}`],
    ["Received ever", String(all)],
    ["Senders", String(senderTotal)],
    ["Sessions", String(sessions)],
  ];
  const fill = Math.min(100, Math.round((cap.used / Math.max(1, cap.limit)) * 100));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/accounts" className="text-sm text-mute hover:text-bone">← Users</Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{u.name}</h1>
          <a href={`${APP_URL}/${u.handle}`} target="_blank" rel="noreferrer" className="text-mute hover:text-bone">@{u.handle} ↗</a>
        </div>
        <p className="mt-1 text-sm text-mute">
          {u.first_name || u.last_name ? `${u.first_name} ${u.last_name} · ` : "legal name not given · "}{u.email} · {KIND_LABEL[u.kind ?? ""] ?? "type not set"} · joined {day(u.created_at)} · {u.invite_code ? `invite ${u.invite_code}` : u.referred_by ? <Link href={`/admin/accounts/${u.referred_by}`} className="underline">referred</Link> : "no invite"} · {u.tz}{u.signup_source ? ` · came from ${u.signup_source}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {u.suspended_at && <span className="chip border-danger/50 text-danger">Suspended {day(u.suspended_at)}{u.suspended_reason ? `: ${u.suspended_reason}` : ""}</span>}
          {pendingEmail && <span className="chip border-lime/40 text-lime">Email change to {pendingEmail} waiting</span>}
          {oldHandles.map((h) => (
            <span key={h.old_handle} className="chip border-line text-mute">/{h.old_handle} forwards until {day(h.expires_at)}</span>
          ))}
          {chips.map(([label, good]) => (
            <span key={label} className={`chip ${good ? "border-lime/40 text-lime" : "border-line text-mute"}`}>{label}</span>
          ))}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="crm-h" className="space-y-3">
            <h2 id="crm-h" className="text-lg font-semibold">Tags and notes <span className="text-sm font-normal text-mute">(only admins see these)</span></h2>
            <form action={saveTags.bind(null, u.id)} className="flex flex-wrap items-center gap-2">
              <input name="tags" defaultValue={u.admin_tags.split(",").join(", ")} placeholder="beta-1, label-lead" className="input max-w-md" aria-label="Tags" />
              <button className="btn-ghost btn-sm">Save tags</button>
            </form>
            <form action={addNote.bind(null, u.id)} className="space-y-2">
              <textarea name="note" rows={2} maxLength={2000} placeholder="Add a note: a call, a promise, feedback…" className="input" aria-label="New note" />
              <button className="btn-ghost btn-sm">Add note</button>
            </form>
            {notes.length > 0 && (
              <ul className="divide-y divide-line rounded-md border border-line">
                {notes.map((n) => (
                  <li key={n.id} className="px-4 py-3 text-sm">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-mute">{day(n.created_at)}{n.handle ? ` · @${n.handle}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="usage-h" className="space-y-3">
            <h2 id="usage-h" className="text-lg font-semibold">Usage</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {usage.map(([k, v]) => (
                <div key={k} className="rounded-md border border-line p-3">
                  <dt className="label">{k}</dt>
                  <dd className="mt-1 break-words text-sm font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="h-1.5 rounded-full bg-ink-3" aria-label={`Desk ${fill}% full`}>
              <div className={`h-1.5 rounded-full ${fill >= 90 ? "bg-danger" : "bg-lime"}`} style={{ width: `${fill}%` }} />
            </div>
          </section>

          <section aria-labelledby="senders-h" className="space-y-3">
            <h2 id="senders-h" className="text-lg font-semibold">Senders <span className="text-mute">({senderTotal})</span></h2>
            {!senders.length ? (
              <p className="text-mute">Nobody has sent them anything yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line text-sm">
                {senders.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span className="min-w-0">
                      {s.name} <span className="text-mute">{s.email}</span>
                      {s.blocked_at && <span className="chip ml-2 border-danger/50 text-danger">Blocked by them</span>}
                    </span>
                    <span className="text-mute tnum">{s.tracks} track{s.tracks === 1 ? "" : "s"}{s.last ? ` · last ${day(s.last)}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            {senderTotal > senders.length && (
              <Link href={`/admin/moderation?q=${encodeURIComponent(u.handle)}`} className="text-sm text-mute underline">Search their tracks in Moderation</Link>
            )}
          </section>

          <section aria-labelledby="emails-h" className="space-y-3">
            <h2 id="emails-h" className="text-lg font-semibold">Emails we sent them</h2>
            {!emails.length ? (
              <p className="text-mute">None.</p>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line text-sm">
                {emails.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span className="min-w-0">
                      {m.subject}
                      {m.status.startsWith("failed") && <span className="chip ml-2 border-danger/50 text-danger">{m.status}</span>}
                    </span>
                    <span className="flex items-center gap-3 text-mute">
                      {day(m.created_at)}
                      {m.status.startsWith("failed") && (
                        <ConfirmButton action={resendEmail.bind(null, m.id)} message={`Send "${m.subject}" to ${u.email} again?`} confirmLabel="Resend" className="text-sm text-bone underline">
                          Resend
                        </ConfirmButton>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="support-h" className="space-y-3">
            <h2 id="support-h" className="text-lg font-semibold">Messages to us</h2>
            {!messages.length ? (
              <p className="text-mute">None, including appeals and privacy requests.</p>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line text-sm">
                {messages.map((m) => (
                  <li key={m.id} className="space-y-1 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">
                        {m.topic}
                        {!m.handled_at && <span className="chip ml-2 border-lime/50 text-lime">Open</span>}
                      </span>
                      <span className="flex items-center gap-3 text-mute">
                        {day(m.created_at)}
                        <form action={setContactHandled.bind(null, m.id, !m.handled_at)}>
                          <button className="text-sm text-bone underline">{m.handled_at ? "Reopen" : "Mark handled"}</button>
                        </form>
                      </span>
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap text-mute">{m.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="hist-h" className="space-y-3">
            <h2 id="hist-h" className="text-lg font-semibold">History</h2>
            <p className="text-sm text-mute">Everything admins did to this account, plus plan changes they made themselves.</p>
            <ul className="divide-y divide-line rounded-md border border-line text-sm">
              {history.map((h, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                  <span>
                    {h.action[0].toUpperCase() + h.action.slice(1)}
                    {h.detail && <span className="text-mute"> · {h.detail}</span>}
                    {h.admin && <span className="text-mute"> · @{h.admin}</span>}
                  </span>
                  <span className="text-mute">{when(h.created_at)}</span>
                </li>
              ))}
              {!history.length && <li className="px-4 py-3 text-mute">Nothing yet.</li>}
            </ul>
          </section>

          <section aria-labelledby="act-h" className="space-y-3">
            <h2 id="act-h" className="text-lg font-semibold">Their recent activity</h2>
            <ul className="divide-y divide-line rounded-md border border-line text-sm">
              {log.map((r) => (
                <li key={r.id} className="flex justify-between gap-4 px-4 py-2.5">
                  <span>{AUDIT_LABELS[r.action] ?? r.action} <span className="text-mute">{r.detail}</span></span>
                  <span className="shrink-0 text-mute">{when(r.created_at)}</span>
                </li>
              ))}
              {!log.length && <li className="px-4 py-3 text-mute">Nothing recorded yet.</li>}
            </ul>
          </section>
        </div>

        <aside aria-labelledby="actions-h" className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <h2 id="actions-h" className="text-lg font-semibold">Actions</h2>
          {/* View as, plan, sign-out, two-step, handle and email: account-takeover powers, super admin only. */}
          {me.access.super && (<>
          <div className="space-y-4 rounded-md border border-line p-4">
            <form action={startViewAs.bind(null, id)}>
              <button className="btn-lime btn-sm w-full">View their desk (read-only)</button>
            </form>
            <form action={async (fd: FormData) => { "use server"; await setPlanFor(id, String(fd.get("plan"))); }} className="flex gap-2">
              <select name="plan" defaultValue={u.plan} className="input min-w-0 flex-1" aria-label="Plan">
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="team">Team</option>
              </select>
              <button className="btn-ghost btn-sm">Set plan</button>
            </form>
            <form action={setExtraSeatsFor.bind(null, id)} className="flex gap-2">
              <label className="sr-only" htmlFor="extra-seats">Extra seats</label>
              <input id="extra-seats" name="extra_seats" type="number" min={0} max={500} defaultValue={Number(u.extra_seats ?? 0)} className="input min-w-0 flex-1 tnum" />
              <button className="btn-ghost btn-sm">Set extra seats</button>
            </form>
            <ConfirmButton action={signOutEverywhere.bind(null, id)} message={`Sign @${u.handle} out of every device?`} className="btn-ghost btn-sm w-full">
              Sign out everywhere ({sessions})
            </ConfirmButton>
            {u.totp_enabled_at && (
              <details className="rounded-md border border-line p-3">
                <summary className="cursor-pointer text-sm">Reset two-factor…</summary>
                <form action={resetTwoFactor.bind(null, id)} className="mt-3 space-y-2">
                  <label className="block space-y-1.5">
                    <span className="label">Type their handle</span>
                    <input name="handle" required className="input" placeholder={u.handle} autoComplete="off" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="label">How you confirmed it&apos;s them</span>
                    <input name="how" required minLength={5} className="input" placeholder="Replied from account email + ID match" />
                  </label>
                  <button className="btn-ghost btn-sm">Reset and sign out</button>
                </form>
              </details>
            )}
          </div>

          <div className="space-y-3 rounded-md border border-line p-4">
            <details>
              <summary className="cursor-pointer text-sm">Change handle…</summary>
              <form action={adminChangeHandle.bind(null, id)} className="mt-3 space-y-2">
                <label className="block space-y-1.5">
                  <span className="label">New handle</span>
                  <input name="handle" required className="input" placeholder={u.handle} autoComplete="off" />
                </label>
                <label className="block space-y-1.5">
                  <span className="label">Reason</span>
                  <input name="reason" required minLength={5} className="input" placeholder="Typo at sign-up, asked by email" />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="takeback" className="mt-1 accent-lime" />
                  <span>Taking it back for impersonation: don&apos;t forward the old link, and free the name now</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="protect" className="mt-1 accent-lime" />
                  <span>Also protect the old name (only with the box above)</span>
                </label>
                <button className="btn-ghost btn-sm">Change handle</button>
                <p className="text-xs text-mute">They&apos;re emailed. Normally the old link forwards for 14 days and stays reserved for them, then anyone can claim it. Admin changes don't count toward their once-a-year limit.</p>
              </form>
            </details>
            <details>
              <summary className="cursor-pointer text-sm">Change email…</summary>
              {pendingEmail && (
                <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                  <span className="text-mute">Waiting for {pendingEmail}</span>
                  <ConfirmButton action={adminCancelEmailChange.bind(null, id)} message="Cancel the pending email change?" className="text-sm underline">
                    Cancel
                  </ConfirmButton>
                </div>
              )}
              <form action={adminChangeEmail.bind(null, id)} className="mt-3 space-y-2">
                <label className="block space-y-1.5">
                  <span className="label">New email</span>
                  <input name="email" type="email" required className="input" autoComplete="off" />
                </label>
                <label className="block space-y-1.5">
                  <span className="label">How you confirmed it&apos;s them</span>
                  <input name="how" required minLength={5} className="input" placeholder="Wrote in from the account email" />
                </label>
                <button className="btn-ghost btn-sm">Send confirmation</button>
                <p className="text-xs text-mute">Only changes once the new address clicks the link. The current address is told.</p>
              </form>
            </details>
          </div>
          </>)}

          {support && (
          <div className="space-y-3 rounded-md border border-danger/30 p-4">
            {u.suspended_at ? (
              <ConfirmButton action={unsuspendAccount.bind(null, id)} message={`Restore @${u.handle}? Their link and sign-in come back, and they're emailed.`} className="btn-lime btn-sm w-full">
                Unsuspend
              </ConfirmButton>
            ) : (
              <form action={async (fd: FormData) => { "use server"; await suspendAccount(id, String(fd.get("reason") || "")); }} className="space-y-2">
                <label className="block space-y-1.5">
                  <span className="label">Suspend: reason (they&apos;re emailed it)</span>
                  <input name="reason" className="input" placeholder="e.g. spam uploads" required />
                </label>
                <button className="btn-sm w-full rounded-md border border-danger/50 px-4 text-danger hover:bg-danger/10">Suspend account</button>
              </form>
            )}
            <p className="text-xs text-mute">Suspending signs them out, blocks sign-in, takes their link offline and emails them how to appeal. Nothing is deleted.</p>
            {me.access.super && (
              <Link href={`/admin/privacy?email=${encodeURIComponent(u.email)}`} className="block text-sm text-danger underline">
                Delete account or download their data…
              </Link>
            )}
          </div>
          )}
        </aside>
      </div>
    </div>
  );
}
