import Link from "next/link";
import { ConfirmButton } from "../AdminUi";
import { likeContains, q } from "@/lib/db";
import { liftSuppression, resendEmail } from "../actions";
import { mailUsage } from "@/lib/mail-quota";

const DELIVERY: Record<string, [string, string]> = {
  delivered: ["Delivered", "border-lime/50 text-lime"],
  delayed: ["Delayed", "border-[#ffb648]/50 text-[#ffb648]"],
  bounced: ["Bounced", "border-danger/50 text-danger"],
  complained: ["Marked as spam", "border-danger/50 text-danger"],
};

/** Every email the platform sent, across all accounts, and what happened to it after it left (from Resend). */
export default async function Emails({ searchParams }: { searchParams: Promise<{ q?: string; failed?: string }> }) {
  const sp = await searchParams;
  const search = (sp.q || "").trim().slice(0, 100);
  const failedOnly = sp.failed === "1";
  const where = [
    search ? "(o.to_email ILIKE ? OR o.subject ILIKE ?)" : "",
    failedOnly ? "(o.status LIKE 'failed%' OR o.status LIKE 'skipped%' OR o.delivery IN ('bounced', 'complained'))" : "",
  ].filter(Boolean);
  const tracking = !!process.env.RESEND_WEBHOOK_SECRET;
  const usage = await mailUsage();
  const pct = (n: number, d: number) => Math.min(100, Math.round((n / d) * 100));
  const blocked = await q.all<{ email: string; reason: string; detail: string; created_at: number }>("SELECT * FROM email_suppressions ORDER BY created_at DESC LIMIT 100");
  const rows = await q.all<{ id: number; to_email: string; subject: string; body: string; status: string; delivery: string; audience: string; created_at: number; handle: string | null; user_id: number | null }>(
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
            <input type="checkbox" name="failed" value="1" defaultChecked={failedOnly} /> Problems only
          </label>
          <button className="btn-ghost btn-sm">Search</button>
        </form>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {[
          ["Sent today (UTC)", usage.day, usage.limits.day],
          ["Sent this month", usage.month, usage.limits.month],
        ].map(([k, n, cap]) => (
          <div key={String(k)} className={`rounded-md border p-4 ${Number(n) >= Number(cap) * 0.8 ? "border-danger/50" : "border-line"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="label">{k}</p>
              <p className="text-sm tnum">
                {Number(n).toLocaleString("en")} of {Number(cap).toLocaleString("en")}
              </p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-ink-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(Number(n), Number(cap))} aria-label={String(k)}>
              <div className={`h-2 rounded-full ${Number(n) >= Number(cap) * 0.8 ? "bg-danger" : "bg-lime"}`} style={{ width: `${pct(Number(n), Number(cap))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-faint">Resend&apos;s plan caps. Over them, emails fail. After upgrading, set MAIL_DAILY_LIMIT and MAIL_MONTHLY_LIMIT in Vercel.</p>
      {!tracking && (
        <div className="mt-6 rounded-md border border-line p-4 text-sm text-mute">
          <p className="font-medium text-bone">Delivery tracking isn&apos;t connected</p>
          <p className="mt-1">
            You can see that an email left FloorTest, but not whether it arrived. To connect it: in Resend, go to Webhooks → Add endpoint, enter{" "}
            <span className="font-mono text-bone">https://floortest.imullar.com/api/webhooks/resend</span>, and tick delivered, delivery delayed, bounced and
            complained. Copy its signing secret into Vercel as <span className="font-mono text-bone">RESEND_WEBHOOK_SECRET</span> (Production), then redeploy.
          </p>
        </div>
      )}
      {blocked.length > 0 && (
        <section aria-labelledby="blocked-h" className="mt-6 space-y-2">
          <h2 id="blocked-h" className="text-lg font-semibold">
            Not emailing ({blocked.length})
          </h2>
          <p className="text-sm text-mute">Bounced addresses get nothing. Spam reports still get sign-in codes and resets, but no optional emails.</p>
          <ul className="divide-y divide-line rounded-md border border-line">
            {blocked.map((b) => (
              <li key={b.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0 break-all">
                  <span className="chip mr-2 border-danger/50 text-danger">{b.reason === "complained" ? "Marked as spam" : "Bounced"}</span>
                  {b.email}
                  {b.detail && <span className="text-mute"> · {b.detail}</span>}
                </span>
                <ConfirmButton action={liftSuppression.bind(null, b.email)} message={`Allow email to ${b.email} again?`} className="btn-ghost btn-sm">
                  Allow again
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="mt-6 space-y-2">
        {rows.map((m) => (
          <li key={m.id}>
            <details className="rounded-md border border-line">
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className={`chip mr-2 ${m.status === "sent" ? "border-lime/50 text-lime" : m.status.startsWith("failed") ? "border-danger/50 text-danger" : "border-line text-mute"}`}>{m.status}</span>
                  {DELIVERY[m.delivery] && <span className={`chip mr-2 ${DELIVERY[m.delivery][1]}`}>{DELIVERY[m.delivery][0]}</span>}
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
