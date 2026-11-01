import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { ConfirmButton } from "../AdminUi";
import { likeContains, q } from "@/lib/db";
import { liftSuppression, resendEmail } from "../actions";
import { mailUsage } from "@/lib/mail-quota";
import { APP_URL } from "@/lib/mail";

const DELIVERY: Record<string, [string, string]> = {
  delivered: ["Delivered", "border-lime/50 text-lime"],
  delayed: ["Delayed", "border-[#ffb648]/50 text-[#ffb648]"],
  bounced: ["Bounced", "border-danger/50 text-danger"],
  complained: ["Marked as spam", "border-danger/50 text-danger"],
};

/** Every email the platform sent, across all accounts, and what happened to it after it left (from Resend). */
export default async function Emails({ searchParams }: { searchParams: Promise<{ q?: string; failed?: string }> }) {
  await requireAdmin("emails.read");
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
        <h1 className="text-3xl font-bold tracking-tight">Email log</h1>
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
            <span className="font-mono text-bone">{APP_URL}/api/webhooks/resend</span>, and tick delivered, delivery delayed, bounced and
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
      {/* A timeline of sends (pin 90): a date block on a line, the email's card beside it, opening to the body. */}
      <ol className="relative mt-6 space-y-3 before:absolute before:bottom-4 before:left-[27px] before:top-4 before:w-px before:bg-line">
        {rows.map((m, i) => {
          const d = new Date(m.created_at);
          const failed = m.status.startsWith("failed");
          return (
            <li key={m.id} className="admin-rise relative flex gap-4" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
              <span className={`relative z-[1] grid h-14 w-14 shrink-0 place-items-center rounded-[16px] text-center leading-none ${failed ? "bg-danger/15 text-danger" : i === 0 ? "bg-lime text-ink" : "bg-ink-3 text-bone ring-1 ring-line"}`}>
                <span>
                  <span className="block text-[20px] font-semibold tnum">{d.getUTCDate()}</span>
                  <span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-[1px] opacity-75">{d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</span>
                </span>
              </span>
              <details className="admin-panel group min-w-0 flex-1">
                <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold">{m.subject}</span>
                    <span className="block truncate text-[12.5px] text-mute">
                      → {m.to_email}
                      {m.handle && (
                        <Link href={`/admin/accounts/${m.user_id}`} className="ml-2 hover:text-bone">
                          @{m.handle}
                        </Link>
                      )}
                      <span className="text-faint">
                        {" "}
                        · {m.audience} · {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {DELIVERY[m.delivery] && <span className={`chip ${DELIVERY[m.delivery][1]}`}>{DELIVERY[m.delivery][0]}</span>}
                    <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${m.status === "sent" ? "bg-lime/15 text-lime" : failed ? "bg-danger/15 text-danger" : "bg-ink-4 text-mute"}`}>{m.status}</span>
                    <span aria-hidden className="text-faint transition-transform duration-200 group-open:rotate-180">▾</span>
                  </span>
                </summary>
                <div className="border-t border-line px-4 py-3">
                  <pre className="whitespace-pre-wrap rounded-[12px] bg-ink-3 p-3 text-[13px] text-mute">{m.body}</pre>
                  <ConfirmButton action={resendEmail.bind(null, m.id)} message={`Send "${m.subject}" to ${m.to_email} again?`} className="btn-ghost btn-sm mt-3">
                    Resend
                  </ConfirmButton>
                </div>
              </details>
            </li>
          );
        })}
        {!rows.length && <li className="admin-panel px-4 py-6 text-mute">No emails match.</li>}
      </ol>
    </div>
  );
}
