import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { q } from "@/lib/db";
import { dataFor } from "@/lib/privacy";
import { adminDeleteAccount, adminEraseSender } from "../actions";

/** Privacy requests (access and erasure) for anyone: account holders, senders without an account, people who wrote in. */
export default async function Privacy({ searchParams }: { searchParams: Promise<{ email?: string; done?: string }> }) {
  await requireAdmin("super");
  const sp = await searchParams;
  const email = (sp.email || "").trim().toLowerCase().slice(0, 200);
  const d = email.includes("@") ? await dataFor(email) : null;
  const requests = await q.all<{ id: number; email: string; message: string; created_at: number; handled_at: number | null }>(
    "SELECT id, email, message, created_at, handled_at FROM contact_messages WHERE topic = 'Privacy request' ORDER BY handled_at IS NULL DESC, created_at DESC LIMIT 20",
  );
  const receivers = d ? new Set(d.sent.map((s) => s.sent_to)).size : 0;
  const tracks = d ? d.sent.filter((s) => s.title).length : 0;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Privacy requests</h1>
        <p className="mt-2 text-mute">When someone asks for a copy of their data, or to be erased. Look them up by email. People can also do both themselves from Settings if they have an account.</p>
      </div>
      {sp.done && (
        <p role="status" className="rounded-md border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          {sp.done === "account" ? "Account deleted, with its files." : "Sender data erased, with the tracks they sent."} It&apos;s in the admin log.
        </p>
      )}

      <section aria-labelledby="req-h" className="space-y-3">
        <h2 id="req-h" className="text-lg font-semibold">Requests in the inbox</h2>
        {!requests.length && <p className="text-mute">None yet. They arrive through Contact, topic &quot;Privacy request&quot;.</p>}
        <ul className="divide-y divide-line rounded-md border border-line">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/admin/privacy?email=${encodeURIComponent(r.email)}`} className="font-bold hover:underline">{r.email}</Link>
                {!r.handled_at && <span className="chip ml-2 border-lime/50 text-lime">Open</span>}
                <p className="line-clamp-2 text-mute">{r.message}</p>
              </div>
              <span className="text-mute">{new Date(r.created_at).toLocaleDateString("en-GB")}</span>
            </li>
          ))}
        </ul>
        {requests.length > 0 && <p className="text-xs text-mute">Mark them handled in the <Link href="/admin/inbox" className="underline">Inbox</Link> once done.</p>}
      </section>

      <form className="flex gap-2">
        <input name="email" type="email" defaultValue={email} required className="input w-80" placeholder="person@example.com" aria-label="Email" />
        <button className="btn-ghost btn-sm">Look up</button>
      </form>

      {d && (
        <section className="space-y-5 rounded-md border border-line p-5">
          <ul className="grid gap-1 text-sm">
            <li>Account: {d.account ? <Link href={`/admin/accounts/${d.account.id}`} className="underline">@{String(d.account.handle)}</Link> : <span className="text-mute">none</span>}</li>
            <li>As a sender: {tracks} track{tracks === 1 ? "" : "s"} to {receivers} receiver{receivers === 1 ? "" : "s"}</li>
            <li>Messages to us: {d.messages.length} · Emails we sent them: {d.emails.length}{d.waitlist ? " · On the waitlist" : ""}</li>
            <li>Teams: on {d.teams.memberOf.length} · invites to this address {d.teams.invites.length} · replies held for approval {d.teams.heldReplies.length}</li>
          </ul>
          <a href={`/api/admin/data?email=${encodeURIComponent(email)}`} className="btn-lime btn-sm inline-block">Download their data (JSON)</a>

          {d.account && (
            <form action={adminDeleteAccount.bind(null, Number(d.account.id))} className="space-y-2 rounded-md border border-danger/30 p-4">
              <p className="text-sm font-bold text-danger">Delete their account</p>
              <p className="text-xs text-mute">Removes the account, every track on their desk and the files. Can&apos;t be undone.</p>
              <div className="flex flex-wrap gap-2">
                <input name="confirm" required className="input min-w-0 flex-1" placeholder={`Type ${email} to confirm`} autoComplete="off" />
                <button className="btn-sm rounded-md border border-danger/50 px-4 text-danger hover:bg-danger/10">Delete account</button>
              </div>
            </form>
          )}
          {(d.sent.length > 0 || d.messages.length > 0 || d.waitlist) && (
            <form action={adminEraseSender} className="space-y-2 rounded-md border border-danger/30 p-4">
              <input type="hidden" name="email" value={email} />
              <p className="text-sm font-bold text-danger">Erase them as a sender</p>
              <p className="text-xs text-mute">Removes their sender records and the tracks they sent from every receiver&apos;s desk, with the files, plus their messages and waitlist entry. Can&apos;t be undone.</p>
              <div className="flex flex-wrap gap-2">
                <input name="confirm" required className="input min-w-0 flex-1" placeholder={`Type ${email} to confirm`} autoComplete="off" />
                <button className="btn-sm rounded-md border border-danger/50 px-4 text-danger hover:bg-danger/10">Erase</button>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
