import { requireAdmin } from "@/lib/admin";
import { CuePoint } from "@/components/CuePoint";
import Link from "next/link";
import { ConfirmButton, ConfirmSubmit } from "../AdminUi";
import { q } from "@/lib/db";
import { addProtectedName, approveIdentity, rejectIdentity, removeProtectedName, revokeIdentity } from "../actions";
import { Avatar, PageHead, Stepper } from "../PinParts";
import { OpsForm } from "../OpsForm";

const STEPS = ["Requested", "Code checked", "Verified"];

/**
 * Identity requests to review, each laid out like pin 89's tracker (owner, 1 Nov): requested, code checked, verified,
 * with the code to look for and the profiles to look in. Below: names nobody can claim without us, and who's verified.
 */
export default async function Verification() {
  await requireAdmin("verification");
  const pending = await q.all<{ id: number; name: string; handle: string; email: string; identity_code: string | null; identity_links: string; identity_submitted_at: number | null }>(
    "SELECT id, name, handle, email, identity_code, identity_links, identity_submitted_at FROM users WHERE identity_status = 'pending' ORDER BY identity_submitted_at",
  );
  const verified = await q.all<{ id: number; name: string; handle: string; identity_verified_at: number | null }>(
    "SELECT id, name, handle, identity_verified_at FROM users WHERE identity_status = 'verified' ORDER BY identity_verified_at DESC LIMIT 50",
  );
  const names = await q.all<{ handle: string; note: string; created_at: number }>("SELECT * FROM protected_names ORDER BY handle");

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Safety" title="Verification">
        Open each profile and check the code is in the bio and the profile matches the name. Approve adds the Verified mark (Cue Point) to their page.
      </PageHead>

      <section aria-labelledby="req-h" className="space-y-3">
        <h2 id="req-h" className="flex items-center gap-2 text-[15px] font-semibold">
          Waiting
          <span className="rounded-full bg-ink-4 px-2 text-[11.5px] font-semibold text-mute tnum">{pending.length}</span>
        </h2>
        {!pending.length && <p className="admin-panel p-6 text-[14px] text-mute">No requests waiting.</p>}
        <ul className="grid items-start gap-6 lg:grid-cols-2">
          {pending.map((u, i) => (
            <li key={u.id} className="admin-panel admin-rise p-5" style={{ "--i": i + 1 } as React.CSSProperties}>
              <div className="flex items-start gap-3">
                <Avatar name={u.name || u.handle} size={40} />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/accounts/${u.id}`} className="block truncate text-[15px] font-semibold hover:underline">
                    {u.name}
                  </Link>
                  <p className="truncate text-[12.5px] text-faint">
                    @{u.handle} · {u.email}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] text-faint">{u.identity_submitted_at ? new Date(u.identity_submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}</span>
              </div>
              <div className="mt-5">
                <Stepper steps={STEPS} done={1} status="Look for the code, then approve…" />
              </div>
              <div className="mt-4 rounded-[14px] bg-ink-3 px-4 py-3">
                <p className="text-[13px] text-mute">Look for this code in one of their profiles</p>
                <p className="mt-1 font-mono text-[22px] font-semibold tracking-[0.08em] text-lime">{u.identity_code}</p>
                <ul className="mt-2 space-y-1 text-[13.5px]">
                  {(JSON.parse(u.identity_links || "[]") as string[]).map((l) => (
                    <li key={l}>
                      <a href={l} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center break-all text-bone underline underline-offset-4 hover:text-lime">
                        {l.replace(/^https:\/\//, "")} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <OpsForm action={approveIdentity.bind(null, u.id)}>
                  <button className="admin-press inline-flex min-h-11 items-center rounded-full bg-lime px-5 text-[13.5px] font-semibold text-ink">Approve</button>
                </OpsForm>
                <OpsForm action={rejectIdentity.bind(null, u.id)} className="flex min-w-0 flex-1 flex-wrap gap-2">
                  <label className="min-w-0 flex-1 basis-48">
                    <span className="sr-only">Why not yet (sent to them)</span>
                    <input name="note" className="input min-h-11 w-full" placeholder="Why (sent to them), e.g. code not in bio" />
                  </label>
                  <button className="admin-press inline-flex min-h-11 items-center rounded-full px-5 text-[13.5px] font-semibold text-danger ring-1 ring-danger/40 hover:bg-danger/10">Not yet</button>
                </OpsForm>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="names-h" className="admin-panel admin-rise p-5" style={{ "--i": 3 } as React.CSSProperties}>
        <h2 id="names-h" className="text-[16px] font-semibold">Protected names</h2>
        <p className="mt-1 text-[13.5px] text-mute">
          Nobody can sign up with, or switch to, a link that is or contains one of these (ignoring spaces, dashes and numbers). The real person contacts you, you
          remove the name, they claim it, then you add it back.
        </p>
        <form action={addProtectedName} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block space-y-1.5">
            <span className="label">Names (comma or new line)</span>
            <textarea name="names" rows={2} className="input resize-y" placeholder={"Black Coffee\nPeggy Gou"} />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Note</span>
            <input name="note" className="input" placeholder="e.g. headliners, labels" />
          </label>
          <button className="admin-press inline-flex min-h-11 items-center justify-center rounded-full bg-lime px-5 text-[13.5px] font-semibold text-ink">Protect</button>
        </form>
        <ul className="mt-4 flex flex-wrap gap-2">
          {names.map((n) => (
            <li key={n.handle} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-ink-3 pl-3.5 text-[13px] ring-1 ring-line">
              <span className="font-semibold">{n.handle}</span>
              {n.note && <span className="text-mute">· {n.note}</span>}
              <ConfirmButton action={removeProtectedName.bind(null, n.handle)} message={`Let people claim "${n.handle}" again?`} className="grid size-9 place-items-center rounded-full text-mute hover:text-danger">
                <span aria-hidden>×</span>
                <span className="sr-only">Unprotect {n.handle}</span>
              </ConfirmButton>
            </li>
          ))}
          {!names.length && <li className="text-[13px] text-mute">No protected names yet.</li>}
        </ul>
      </section>

      <section aria-labelledby="ver-h" className="admin-panel admin-rise p-4 sm:p-5" style={{ "--i": 4 } as React.CSSProperties}>
        <h2 id="ver-h" className="flex items-center gap-2 text-[16px] font-semibold">
          Verified
          <span className="rounded-full bg-ink-4 px-2 text-[11.5px] font-semibold text-mute tnum">{verified.length}</span>
        </h2>
        <p className="mt-1 text-[13.5px] text-mute">Revoke removes the badge straight away and emails them your reason. They can apply again.</p>
        <ul className="mt-4 overflow-hidden rounded-[16px] ring-1 ring-line">
          {verified.map((u) => (
            <li key={u.id} className="border-t border-line first:border-t-0">
              <details className="group">
                <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-2.5 hover:bg-ink-3/50 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={u.name || u.handle} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 truncate text-[14px] font-semibold text-lime">
                        <CuePoint size={16} />
                        {u.name}
                      </span>
                      <span className="block truncate text-[12px] text-faint">
                        @{u.handle}
                        {u.identity_verified_at ? ` · since ${new Date(u.identity_verified_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex min-h-11 items-center rounded-full px-4 text-[12.5px] font-semibold text-mute ring-1 ring-line-2 group-open:text-bone">
                    <span className="group-open:hidden">Revoke…</span>
                    <span className="hidden group-open:inline">Close</span>
                  </span>
                </summary>
                <form action={revokeIdentity.bind(null, u.id)} className="flex flex-wrap gap-2 border-t border-line bg-ink-3/40 px-4 py-3">
                  <Link href={`/admin/accounts/${u.id}`} className="inline-flex min-h-11 items-center text-[13px] text-mute underline underline-offset-4 hover:text-bone">
                    Open account
                  </Link>
                  <label className="min-w-0 flex-1 basis-56" htmlFor={`revoke-${u.id}`}>
                    <span className="sr-only">Reason for removing @{u.handle}&apos;s verification</span>
                    <input id={`revoke-${u.id}`} name="note" required className="input min-h-11 w-full" placeholder="Reason (sent to them)" />
                  </label>
                  <ConfirmSubmit
                    message={`Remove @${u.handle}'s verified badge? They'll be told the reason.`}
                    className="admin-press inline-flex min-h-11 items-center rounded-full px-5 text-[13.5px] font-semibold text-danger ring-1 ring-danger/40 hover:bg-danger/10"
                  >
                    Revoke
                  </ConfirmSubmit>
                </form>
              </details>
            </li>
          ))}
          {!verified.length && <li className="px-4 py-6 text-[14px] text-mute">Nobody yet.</li>}
        </ul>
      </section>
    </div>
  );
}
