import { trackUse } from "@/lib/usage";
import { requireRole } from "@/lib/auth";
import {q } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { prefsFor } from "@/lib/notify";
import { NotificationsForm } from "./NotificationsForm";
import { PageTitle, Section } from "../Section";
import { Icon } from "@/components/Kit";
import { Notice, WELL } from "../ui";
import { Fold } from "../Fold";

export const metadata = { title: "Notifications — FloorTest" };

type Mail = { id: number; subject: string; body: string; status: string; created_at: number };

export default async function Notifications() {
  const user = await requireRole("owner");
  await trackUse(user.id, "notifications");
  const p = await prefsFor(user.id);
  const mails = (await q.all<Mail>("SELECT id, subject, body, status, created_at FROM outbox WHERE user_id = ? AND audience = 'receiver' ORDER BY created_at DESC LIMIT 20", user.id));
  const pending = (
    (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND receiver_notified_at IS NULL AND decision IS NULL", user.id))!
  ).n;

  return (
    <>
      <PageTitle
        title="Notifications"
        sub={
          <>
            How FloorTest emails you at <span className="text-bone">{user.email}</span>. The bell in the top bar always shows everything.
          </>
        }
      />
      <Section id="email-prefs-h" icon="bell" title="What we email you">
        <NotificationsForm
          prefs={{
            mode: p.notify_submissions,
            digestHour: p.digest_hour,
            quietStart: p.quiet_start,
            quietEnd: p.quiet_end,
            alerts: !!p.notify_alerts,
            product: !!p.notify_product,
            marketing: !!p.notify_marketing,
            tz: p.tz,
          }}
          pending={pending}
        />
      </Section>

      <Section id="sent-h" icon="mail" title="Recent emails to you" sub="The last 20 we sent. Open one to read it as it went out.">
        {!process.env.RESEND_API_KEY && (
          <Notice tone="info" className="mb-3" next="On the live site they go to your inbox as well.">
            Email delivery isn&apos;t set up here, so these are only logged on this page.
          </Notice>
        )}
        {mails.length === 0 ? (
          <p className={`${WELL} px-3.5 py-3 text-[12.5px] text-mute`}>None yet. When a track arrives or your storage fills up, the email shows here too.</p>
        ) : (
          <Fold title="Emails" count={mails.length} lead={`Newest: ${mails[0].subject}, ${fmtDate(mails[0].created_at)}`}>
          <ul>
            {mails.map((m) => (
              <li key={m.id} className="border-t border-line first:border-t-0">
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 hover:bg-card [&::-webkit-details-marker]:hidden">
                    <Icon name="chev" className="size-4 text-faint transition-transform group-open:rotate-90 motion-reduce:transition-none" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-bone">{m.subject}</span>
                    <span className="shrink-0 text-[11.5px] text-mute tnum">{fmtDate(m.created_at)}</span>
                  </summary>
                  <pre className="mx-3.5 mb-3.5 whitespace-pre-wrap border-t border-line pt-3 font-sans text-[12.5px] leading-relaxed text-mute">{m.body}</pre>
                </details>
              </li>
            ))}
          </ul>
          </Fold>
        )}
      </Section>
    </>
  );
}
