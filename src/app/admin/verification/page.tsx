import { CuePoint } from "@/components/CuePoint";
import Link from "next/link";
import { ConfirmButton } from "../AdminUi";
import { q } from "@/lib/db";
import { addProtectedName, approveIdentity, rejectIdentity, removeProtectedName, revokeIdentity } from "../actions";

/** Identity requests to review, and names nobody can claim without us. */
export default async function Verification() {
  const pending = await q.all<{ id: number; name: string; handle: string; email: string; identity_code: string | null; identity_links: string; identity_submitted_at: number | null }>(
    "SELECT id, name, handle, email, identity_code, identity_links, identity_submitted_at FROM users WHERE identity_status = 'pending' ORDER BY identity_submitted_at",
  );
  const verified = await q.all<{ id: number; name: string; handle: string; identity_verified_at: number | null }>(
    "SELECT id, name, handle, identity_verified_at FROM users WHERE identity_status = 'verified' ORDER BY identity_verified_at DESC LIMIT 50",
  );
  const names = await q.all<{ handle: string; note: string; created_at: number }>("SELECT * FROM protected_names ORDER BY handle");

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Verification</h1>
        <p className="mt-2 text-mute">
          Open each profile and check the code is in the bio and the profile matches the name. Approve adds the Verified mark (Cue Point) to their page.
        </p>
        <ul className="mt-6 space-y-3">
          {pending.map((u) => (
            <li key={u.id} className="rounded-md border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                  <Link href={`/admin/accounts/${u.id}`} className="font-medium hover:underline">
                    {u.name}
                  </Link>{" "}
                  <span className="text-mute">@{u.handle} · {u.email}</span>
                </p>
                <span className="text-sm text-mute">{u.identity_submitted_at ? new Date(u.identity_submitted_at).toLocaleString("en-GB") : ""}</span>
              </div>
              <p className="mt-2 text-sm">
                Look for <span className="rounded-sm bg-ink px-2 py-0.5 text-lime">{u.identity_code}</span> in one of:
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {(JSON.parse(u.identity_links || "[]") as string[]).map((l) => (
                  <li key={l}>
                    <a href={l} target="_blank" rel="noreferrer noopener" className="text-bone underline underline-offset-4 hover:text-lime">
                      {l.replace(/^https:\/\//, "")} ↗
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <form action={approveIdentity.bind(null, u.id)}>
                  <button className="btn-lime btn-sm">Approve</button>
                </form>
                <form action={rejectIdentity.bind(null, u.id)} className="flex flex-wrap gap-2">
                  <input name="note" className="input w-72 py-2" placeholder="Why (sent to them), e.g. code not in bio" />
                  <button className="btn-sm rounded-md border border-danger/50 px-3 text-danger hover:bg-danger/10">Not yet</button>
                </form>
              </div>
            </li>
          ))}
          {!pending.length && <li className="rounded-md border border-line px-4 py-6 text-mute">No requests waiting.</li>}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Protected names</h2>
        <p className="mt-1 text-sm text-mute">
          Nobody can sign up with, or switch to, a link that is or contains one of these (ignoring spaces, dashes and numbers). The real person contacts you, you
          remove the name, they claim it, then you add it back.
        </p>
        <form action={addProtectedName} className="mt-4 grid gap-3 rounded-md border border-line p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block space-y-1.5">
            <span className="label">Names (comma or new line)</span>
            <textarea name="names" rows={2} className="input resize-y" placeholder={"Black Coffee\nPeggy Gou"} />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Note</span>
            <input name="note" className="input" placeholder="e.g. headliners, labels" />
          </label>
          <button className="btn-lime btn-sm">Protect</button>
        </form>
        <ul className="mt-4 flex flex-wrap gap-2">
          {names.map((n) => (
            <li key={n.handle} className="chip border-line">
              <span >{n.handle}</span>
              {n.note && <span className="ml-1 text-mute">· {n.note}</span>}
              <ConfirmButton action={removeProtectedName.bind(null, n.handle)} message={`Let people claim "${n.handle}" again?`} className="ml-2 text-mute hover:text-danger">
                ×
              </ConfirmButton>
            </li>
          ))}
          {!names.length && <li className="text-sm text-mute">No protected names yet.</li>}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Verified</h2>
        <p className="mt-1 text-sm text-mute">Revoke removes the badge straight away and emails them your reason. They can apply again.</p>
        <ul className="mt-3 divide-y divide-line rounded-md border border-line">
          {verified.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="min-w-0">
                <Link href={`/admin/accounts/${u.id}`} className="font-medium text-lime hover:underline">
                  <CuePoint size={16} className="mr-1.5" />
                  {u.name}
                </Link>{" "}
                <span className="text-sm text-mute">
                  @{u.handle}
                  {u.identity_verified_at ? ` · since ${new Date(u.identity_verified_at).toLocaleDateString("en-GB")}` : ""}
                </span>
              </p>
              <form action={revokeIdentity.bind(null, u.id)} className="flex flex-wrap gap-2">
                <label className="sr-only" htmlFor={`revoke-${u.id}`}>Reason for removing @{u.handle}&apos;s verification</label>
                <input id={`revoke-${u.id}`} name="note" required className="input w-64 py-1.5" placeholder="Reason (sent to them)" />
                <button className="btn-sm rounded-md border border-danger/50 px-3 text-danger hover:bg-danger/10">Revoke</button>
              </form>
            </li>
          ))}
          {!verified.length && <li className="px-4 py-6 text-sm text-mute">Nobody yet.</li>}
        </ul>
      </section>
    </div>
  );
}
