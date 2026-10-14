import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { q, type Sender } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { MAX_UPLOAD_BYTES, RATE_PER_EMAIL_PER_DAY, RATE_PER_IP_PER_HOUR, RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS, SIGNALS } from "@/lib/plans";
import { blockSender } from "../../actions/review";
import { setRerouteClosed } from "../../actions/settings";
import { PageTitle, Section } from "../Section";

export const metadata = { title: "Receiving — FloorTest" };

export default async function Receiving() {
  const user = await requireRole("admin");
  const blocked = await q.all<Sender>("SELECT * FROM senders WHERE user_id = ? AND blocked_at IS NOT NULL ORDER BY blocked_at DESC", user.id);
  const reroute = !!(await q.get<{ v: number }>("SELECT reroute_closed AS v FROM users WHERE id = ?", user.id))?.v;
  return (
    <>
      <PageTitle title="Receiving" sub="Who can reach your desk, and what happens to what they send." />
      <Section
        id="reroute-h"
        title="When a callout closes"
        sub={
          reroute
            ? "On. When the collection your link sends to passes its closing date, your link moves to your newest open collection overnight. We email you when it does."
            : "Off. When the collection your link sends to passes its closing date, your link stops taking music until you choose another collection."
        }
      >
        <form action={setRerouteClosed.bind(null, !reroute)}>
          <button className="btn-ghost btn-sm min-h-11">{reroute ? "Turn off" : "Turn on"}</button>
        </form>
      </Section>
      <Section id="blocked-h" title="Blocked senders" sub={blocked.length ? undefined : "None. Block a sender from their contact page."}>
        {blocked.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {blocked.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="truncate text-sm text-mute">
                    {s.email} · blocked {fmtDay(s.blocked_at!)}
                  </p>
                </div>
                <form action={blockSender.bind(null, s.id, false)}>
                  <button className="btn-ghost btn-sm min-h-11">Unblock</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section id="rules-h" title="How your desk works" sub="Closing dates are set per collection.">
        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-bone underline underline-offset-4 group-open:mb-4">Show the rules</summary>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-mute">
            <li>WAV or MP3 only, up to {Math.round(MAX_UPLOAD_BYTES / 1048576)} MB per send. Files are checked for valid audio before they&apos;re accepted.</li>
            <li>
              Each connection can send {RATE_PER_IP_PER_HOUR} times an hour, and each email {RATE_PER_EMAIL_PER_DAY} times a day, to your link.
            </li>
            <li>Tracks you haven&apos;t decided on are deleted {RETAIN_UNREVIEWED_DAYS} days after delivery.</li>
            <li>Tracks marked “Not for me” are deleted {RETAIN_PASSED_DAYS} days after you mark them. Kept tracks stay until you delete them.</li>
          </ul>
        </details>
      </Section>
      <Section id="signals-h" title="What senders are told" sub="Senders get an email for each of these and see them on their receipt. Keep and Not for me stay private.">
        <dl className="divide-y divide-line rounded-lg border border-line text-sm">
          {[
            ["Delivered", "Their file reached your desk"],
            ["Listened", SIGNALS.listened],
            ["Downloaded", SIGNALS.downloaded],
            ["Replied", "You replied by email"],
            ["Played out", "You marked it as played in a set"],
            ["Keep, Not for me", "Private to you"],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
              <dt className="font-medium">{k}</dt>
              <dd className="text-mute">{v}</dd>
            </div>
          ))}
        </dl>
        <Link href="/dashboard/emails" className="mt-3 inline-block py-2 text-sm underline underline-offset-4">
          See every email sent to senders →
        </Link>
      </Section>
    </>
  );
}
