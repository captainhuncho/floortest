import Link from "next/link";
import { ConfirmButton } from "../../dashboard/ClientBits";
import { likeContains, q } from "@/lib/db";
import { resendEmail } from "../actions";

/** Every email the platform sent, across all accounts. */
export default async function Emails({ searchParams }: { searchParams: Promise<{ q?: string; failed?: string }> }) {
  const sp = await searchParams;
  const search = (sp.q || "").trim().slice(0, 100);
  const failedOnly = sp.failed === "1";
  const where = [search ? "(o.to_email ILIKE ? OR o.subject ILIKE ?)" : "", failedOnly ? "o.status LIKE 'failed%'" : ""].filter(Boolean);
  const rows = await q.all<{ id: number; to_email: string; subject: string; body: string; status: string; audience: string; created_at: number; handle: string | null; user_id: number | null }>(
    `SELECT o.*, u.handle FROM outbox o LEFT JOIN users u ON u.id = o.user_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY o.created_at DESC LIMIT 200`,
    ...(search ? [likeContains(search), likeContains(search)] : []),
  );
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Emails</h1>
        <form className="flex flex-wrap items-center gap-2">
          <input name="q" defaultValue={search} className="input w-64" placeholder="Recipient or subject" aria-label="Search emails" />
          <label className="flex items-center gap-1.5 text-sm text-mute">
            <input type="checkbox" name="failed" value="1" defaultChecked={failedOnly} /> Failed only
          </label>
          <button className="btn-ghost btn-sm">Search</button>
        </form>
      </div>
      <ul className="mt-6 space-y-2">
        {rows.map((m) => (
          <li key={m.id}>
            <details className="rounded-md border border-line">
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className={`chip mr-2 ${m.status === "sent" ? "border-lime/50 text-lime" : m.status.startsWith("failed") ? "border-danger/50 text-danger" : "border-line text-mute"}`}>{m.status}</span>
                  {m.subject} <span className="text-mute">→ {m.to_email}</span>
                </span>
                <span className="text-sm text-mute">
                  {m.handle && <Link href={`/admin/accounts/${m.user_id}`} className="mr-2 hover:text-bone">@{m.handle}</Link>}
                  {m.audience} · {new Date(m.created_at).toLocaleString("en-GB")}
                </span>
              </summary>
              <div className="border-t border-line px-4 py-3">
                <pre className="whitespace-pre-wrap text-sm text-mute">{m.body}</pre>
                <ConfirmButton action={resendEmail.bind(null, m.id)} message={`Send "${m.subject}" to ${m.to_email} again?`} className="btn-ghost btn-sm mt-3">
                  Resend
                </ConfirmButton>
              </div>
            </details>
          </li>
        ))}
        {!rows.length && <li className="rounded-md border border-line px-4 py-6 text-mute">No emails match.</li>}
      </ul>
    </div>
  );
}
