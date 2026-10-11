import { requireRole } from "@/lib/auth";
import {q } from "@/lib/db";
import { fmtDate } from "@/lib/format";

type Mail = { id: number; to_email: string; subject: string; body: string; status: string; created_at: number };

export const metadata = { title: "Emails to senders — FloorTest" };

export default async function Emails() {
  const user = await requireRole("admin");
  const mails = (await q.all<Mail>("SELECT * FROM outbox WHERE user_id = ? AND audience = 'sender' ORDER BY created_at DESC LIMIT 200", user.id));
  const live = !!process.env.RESEND_API_KEY;
  return (
    <div className="px-4 py-6 sm:px-8">
            <h1 className="mt-1 text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone">Emails sent to senders</h1>
      <p className="mt-2 max-w-xl text-sm text-mute">
        What FloorTest told senders on your behalf.{" "}
        {live ? "Delivered via Resend." : "Email delivery isn't configured, so these are logged here only. Set RESEND_API_KEY to send them."}
      </p>
      {mails.length === 0 ? (
        <p className="py-16 text-center text-sm text-mute">Nothing sent yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {mails.map((m) => (
            <li key={m.id}>
              <details className="card group p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.subject}</p>
                    <p className="truncate text-xs text-mute">to {m.to_email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-mute">
                    <span className={`chip ${m.status === "sent" ? "border-lime/50 text-lime" : m.status.startsWith("failed") ? "border-danger/50 text-danger" : "border-line"}`}>{m.status}</span>
                    <span className="hidden sm:inline">{fmtDate(m.created_at)}</span>
                  </div>
                </summary>
                <pre className="mt-4 whitespace-pre-wrap border-t border-line pt-4 font-sans text-sm text-mute">{m.body}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
