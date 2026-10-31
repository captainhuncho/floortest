import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { q, type Sender } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { MAX_UPLOAD_BYTES, RATE_PER_EMAIL_PER_DAY, RATE_PER_IP_PER_HOUR, RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS, SIGNALS } from "@/lib/plans";
import { Chip, Icon, initials } from "@/components/Kit";
import { blockSender } from "../../actions/review";
import { setRerouteClosed } from "../../actions/settings";
import { PageTitle, Section } from "../Section";
import { BTN_GHOST, ROW, SettingLine, WELL } from "../ui";

export const metadata = { title: "Receiving — FloorTest" };

export default async function Receiving() {
  const user = await requireRole("admin");
  const blocked = await q.all<Sender>("SELECT * FROM senders WHERE user_id = ? AND blocked_at IS NOT NULL ORDER BY blocked_at DESC", user.id);
  const reroute = !!(await q.get<{ v: number }>("SELECT reroute_closed AS v FROM users WHERE id = ?", user.id))?.v;
  // What each sender hears about, and the two calls that stay private.
  const signals: [string, string, boolean][] = [
    ["Delivered", "Their file reached your desk", true],
    ["Listened", SIGNALS.listened, true],
    ["Downloaded", SIGNALS.downloaded, true],
    ["Replied", "You replied by email", true],
    ["Played out", "You marked it as played in a set", true],
    ["Keep, Not for me", "Private to you", false],
  ];
  return (
    <>
      <PageTitle title="Receiving" sub="Who can reach your desk, and what happens to what they send." />
      <Section id="reroute-h" icon="folder" title="When a callout closes">
        <SettingLine
          title={<>Move my link to the next open collection {reroute ? <Chip tone="up">On</Chip> : <Chip>Off</Chip>}</>}
          sub={
            reroute
              ? "When the collection your link sends to passes its closing date, your link moves to your newest open collection overnight. We email you when it does."
              : "When the collection your link sends to passes its closing date, your link stops taking music until you choose another collection."
          }
        >
          <form action={setRerouteClosed.bind(null, !reroute)} className="w-full sm:w-auto">
            <button className={`${BTN_GHOST} w-full sm:w-auto`}>{reroute ? "Turn off" : "Turn on"}</button>
          </form>
        </SettingLine>
      </Section>
      <Section id="blocked-h" icon="x" title="Blocked senders" sub={blocked.length ? "They can't send to your link. Unblock to let them back in." : undefined}>
        {blocked.length > 0 ? (
          <ul className={WELL}>
            {blocked.map((s) => (
              <li key={s.id} className={ROW}>
                <div className="flex min-w-0 flex-1 basis-52 items-center gap-2.5">
                  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-card text-[11px] font-bold text-mute">
                    {initials(s.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-bone">{s.name}</p>
                    <p className="truncate text-[11.5px] text-mute">
                      {s.email}, blocked {fmtDay(s.blocked_at!)}
                    </p>
                  </div>
                </div>
                <form action={blockSender.bind(null, s.id, false)}>
                  <button className={BTN_GHOST}>Unblock</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${WELL} px-3.5 py-3 text-[12.5px] text-mute`}>
            Nobody is blocked. To block someone, open them in{" "}
            <Link href="/dashboard/contacts" className="text-bone underline underline-offset-4 hover:text-lime">
              Contacts
            </Link>{" "}
            and choose Block.
          </p>
        )}
      </Section>
      <Section id="signals-h" icon="mail" title="What senders are told" sub="Senders get an email for each of these and see them on their receipt. Keep and Not for me stay private.">
        <dl className={WELL}>
          {signals.map(([k, v, told]) => (
            <div key={k} className="grid gap-0.5 border-t border-line px-3.5 py-2.5 first:border-t-0 sm:grid-cols-[160px_1fr] sm:gap-3">
              <dt className="flex items-center gap-1.5 text-[13px] font-semibold text-bone">
                <Icon name={told ? "check" : "lock"} className={`size-4 ${told ? "text-mute" : "text-faint"}`} />
                {k}
              </dt>
              <dd className="text-[12.5px] text-mute">{v}</dd>
            </div>
          ))}
        </dl>
        <Link href="/dashboard/emails" className="mt-2 inline-flex min-h-11 items-center gap-1 text-[12.5px] text-bone underline underline-offset-4 hover:text-lime">
          See every email sent to senders
          <Icon name="chev" className="size-3.5" />
        </Link>
      </Section>
      <Section id="rules-h" icon="prep" title="How your desk works" sub="Closing dates are set per collection.">
        <details className="group">
          <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-semibold text-bone [&::-webkit-details-marker]:hidden">
            <Icon name="chev" className="size-4 text-mute transition-transform group-open:rotate-90 motion-reduce:transition-none" />
            Show the rules
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12.5px] leading-snug text-mute marker:text-faint">
            <li>WAV or MP3 only, up to {Math.round(MAX_UPLOAD_BYTES / 1048576)} MB per send. Files are checked for valid audio before they&apos;re accepted.</li>
            <li>
              Each connection can send {RATE_PER_IP_PER_HOUR} times an hour, and each email {RATE_PER_EMAIL_PER_DAY} times a day, to your link.
            </li>
            <li>Tracks you haven&apos;t decided on are deleted {RETAIN_UNREVIEWED_DAYS} days after delivery.</li>
            <li>Tracks marked “Not for me” are deleted {RETAIN_PASSED_DAYS} days after you mark them. Kept tracks stay until you delete them.</li>
          </ul>
        </details>
      </Section>
    </>
  );
}
