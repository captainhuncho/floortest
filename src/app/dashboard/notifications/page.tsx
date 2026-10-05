import { trackUse } from "@/lib/usage";
import { requireUser } from "@/lib/auth";
import {q } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { prefsFor } from "@/lib/notify";
import { NotificationsForm } from "./NotificationsForm";

export const metadata = { title: "Notifications — FloorTest" };

type Mail = { id: number; subject: string; body: string; status: string; created_at: number };

export default async function Notifications() {
  const user = await requireUser();
  await trackUse(user.id, "notifications");
  const p = await prefsFor(user.id);
  const mails = (await q.all<Mail>("SELECT id, subject, body, status, created_at FROM outbox WHERE user_id = ? AND audience = 'receiver' ORDER BY created_at DESC LIMIT 20", user.id));
  const pending = (
    (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND receiver_notified_at IS NULL AND decision IS NULL", user.id))!
  ).n;

  return (
    <div className="max-w-3xl space-y-10 px-4 py-6 sm:px-8">
      <div >
        <h1 className="text-[28px] font-bold tracking-[-0.8px]">Notifications</h1>
        <p className="mt-2 text-[12px] text-mute">
          How FloorTest emails you at <span className="text-bone">{user.email}</span>. The bell in the top bar always shows everything.
        </p>
      </div>

      <section className="sm:card sm:p-6">
        <NotificationsForm
          prefs={{
            mode: p.notify_submissions,
            digestHour: p.digest_hour,
            quietStart: p.quiet_start,
            quietEnd: p.quiet_end,
            alerts: !!p.notify_alerts,
            product: !!p.notify_product,
            tz: p.tz,
          }}
          pending={pending}
        />
      </section>

      <section aria-labelledby="sent-h">
        <h2 id="sent-h" className="text-lg font-semibold">
          Recent emails to you
        </h2>
        {!process.env.RESEND_API_KEY && (
          <p className="mt-1 text-sm text-mute">Email delivery isn&apos;t configured, so these are logged here only.</p>
        )}
        {mails.length === 0 ? (
          <p className="mt-3 text-mute">None yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {mails.map((m) => (
              <li key={m.id}>
                <details className="card p-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <span className="truncate font-medium">{m.subject}</span>
                    <span className="shrink-0 text-sm text-mute">{fmtDate(m.created_at)}</span>
                  </summary>
                  <pre className="mt-4 whitespace-pre-wrap border-t border-line pt-4 font-sans text-sm text-mute">{m.body}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
