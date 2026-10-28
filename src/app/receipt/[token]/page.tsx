import Link from "next/link";
import { gatePassword } from "@/lib/site-gate";
import { Logo } from "@/components/Logo";
import { siteEditor } from "@/lib/site-editor";
import { EditablePage, editable } from "@/components/Editable";
import { notFound } from "next/navigation";
import { LivePulse } from "@/components/LivePulse";
import { fill, siteCopy } from "@/lib/content";
import { Waveform } from "@/components/Waveform";
import { q, type Track } from "@/lib/db";
import { ago, fmtDate, fmtDay, fmtTime } from "@/lib/format";
import { RETAIN_UNREVIEWED_DAYS, SIGNALS, unheardAfterWindow } from "@/lib/plans";
import { featureOn } from "@/lib/features";
import { MAX_STEMS, stemsSent } from "@/lib/stems";
import { StemUpload } from "./StemUpload";
import { StatusHeadline } from "./StatusHeadline";
import { ReachedSteps, SignalDot } from "./SignalDot";
import { switchOn } from "@/lib/switches";
import { activeCollection, capacity, isClosed, isPaused, userByHandleForView } from "@/lib/desk";
import { StopSharing } from "./StopSharing";

export const metadata = { title: "Your receipt — FloorTest", robots: { index: false } };

/**
 * A sender's receipt. It answers, in this order: did they listen, when, what else has happened, what it means,
 * and is there anything to do. The receiver's keep/pass decision is private and never appears here.
 */
export default async function Receipt({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = (await q.get<(Track & { receiver: string; receiver_plan: string; collection: string | null; sender_email: string; verified_at: number | null; sender_account: number | null; receiver_handle: string })>(`SELECT t.*, u.name AS receiver, u.handle AS receiver_handle, u.plan AS receiver_plan, c.name AS collection, s.email AS sender_email, s.verified_at, s.account_id AS sender_account
       FROM tracks t JOIN users u ON u.id = t.user_id JOIN senders s ON s.id = t.sender_id
       LEFT JOIN collections c ON c.id = t.collection_id
       WHERE t.token = ?`, token));
  if (!t) notFound();

  const [sharing, signupOpen] = await Promise.all([switchOn("sharing"), switchOn("open_signup")]);
  // The invitation shows once the site is public (behind the coming-soon password it would lead to a wall);
  // with sign-up still invite-only it leads to the waitlist.
  const invite = !gatePassword() && !t.sender_account ? (signupOpen ? "/signup" : "/#waitlist") : null;
  // Neither the stems request nor the share switch changes when the file leaves the desk: that would give a Not for me away.
  const stemsOn = !!t.stems_requested_at && (await featureOn("stems", { id: t.user_id, plan: t.receiver_plan }));
  const [c, editor] = await Promise.all([siteCopy("receipt"), siteEditor()]);
  const { E, panel } = editable(c, !!editor);
  const who = t.receiver;
  // "Send another" only while the receiver's link takes uploads: the same checks as their link page (not paused, the
  // callout open, room on the desk). A suspended account isn't found at all.
  const rcv = await userByHandleForView(t.receiver_handle);
  const takingSends = !!rcv && !isPaused(rcv) && !isClosed(await activeCollection(rcv)) && !(await capacity(rcv)).full;

  /*
   * The lifecycle, from the track itself. "Meaningful" events are things the receiver did with the music;
   * the rest is the system keeping its promises. Only meaningful ones get the bright treatment.
   */
  type Step = { key: string; label: string; at: number | null; meaningful: boolean; note?: string; means: string };
  const steps: Step[] = [
    { key: "delivered", label: "Delivered", at: t.created_at, meaningful: false, note: `to ${who}'s desk${t.collection ? ` for ${t.collection}` : ""}`, means: "The original file reached the desk safely." },
    { key: "listened", label: "Listened", at: t.played_at, meaningful: true, means: SIGNALS.listened + "." },
    { key: "downloaded", label: "Downloaded", at: t.downloaded_at, meaningful: true, means: SIGNALS.downloaded + "." },
    { key: "replied", label: "Replied", at: t.replied_at, meaningful: true, note: "The message is in your email.", means: SIGNALS.replied + "." },
    { key: "played_out", label: "Played out", at: t.played_out_at, meaningful: true, note: t.played_out_note || undefined, means: SIGNALS.playedOut + "." },
  ];
  // When the file left the desk is never shown: "Not for me" files leave sooner than undecided ones, so the date would give the decision away.
  const happened = steps.filter((s) => s.at).sort((a, b) => a.at! - b.at!);
  // One light: the newest step is lime, earlier ones bone, so the sender sees what's new. Until the receiver does
  // something, that's Delivered: the track arrived, and the receipt says so (not after 90 days unheard: no good news).
  const unheard = unheardAfterWindow(t);
  const newest = [...happened].reverse().find((s) => s.meaningful)?.key ?? (unheard ? undefined : "delivered");
  const pending = unheard ? [] : steps.filter((s) => !s.at);

  // The headline is the strongest thing that has happened.
  const when = (at: number) => `${fmtDate(at)} · ${ago(at)}`;
  const headline = t.played_out_at
    ? { status: "played_out", strong: true, title: `${who} played it out.`, detail: `${t.played_out_note ? `“${t.played_out_note}” · ` : ""}${when(t.played_out_at)}` }
    : t.replied_at
      ? { status: "replied", strong: true, title: `${who} replied.`, detail: `The message is in your email · ${when(t.replied_at)}` }
      : t.downloaded_at
        ? { status: "downloaded", strong: true, title: `${who} downloaded it.`, detail: `Listened ${t.played_at ? ago(t.played_at) : "earlier"}, downloaded ${when(t.downloaded_at)}` }
        : t.played_at
          ? { status: "listened", strong: true, title: `${who} listened.`, detail: when(t.played_at) }
          : unheard
            ? { status: "unheard", strong: false, title: `Not listened to in ${RETAIN_UNREVIEWED_DAYS} days.`, detail: `Delivered ${fmtDay(t.created_at)}. Files leave the desk after ${RETAIN_UNREVIEWED_DAYS} days unless they're kept.` }
            : { status: "waiting", strong: false, title: `Waiting for ${who} to listen.`, detail: `Delivered ${when(t.created_at)}. We'll email you the moment it's listened to.` };

  const todo = !t.verified_at || stemsOn;

  return (
    <EditablePage editing={!!editor} page="receipt" label="Receipts" values={c}>
    {/* Rule 15 (28 Oct): the headline, then the track and its history as flat panels with hairline rows; dates in
        mono; plain words, no capitals labels; lime only on the newest step. */}
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 bg-ink px-4 py-8 text-bone sm:gap-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-mute"><E k="kicker" /></p>
        <StatusHeadline status={headline.status} title={headline.title} detail={headline.detail} strong={headline.strong} />
      </header>

      <section aria-label="Track" className="panel flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-bone">{t.title}</p>
            <p className="mt-0.5 truncate text-sm text-mute">{t.artist}</p>
          </div>
          {!!t.duration && <span className="shrink-0 pt-0.5 font-mono text-xs text-mute tnum">{fmtTime(t.duration)}</span>}
        </div>
        {t.peaks && <Waveform peaks={JSON.parse(t.peaks)} height={40} />}
      </section>

      {todo && (
        <section aria-labelledby="todo-h" className="panel flex flex-col gap-3 p-4 sm:p-5">
          <h2 id="todo-h" className="text-[15px] font-bold text-bone">For you</h2>
          {stemsOn && <StemUpload token={token} receiver={who.split(/\s+/)[0]} existing={stemsSent(t)} max={MAX_STEMS} />}
          {!t.verified_at && (
            <p className="text-sm text-mute">
              Confirm your email from the delivery email, so {who} sees you as verified. Updates go to <span className="text-bone">{t.sender_email}</span>.
            </p>
          )}
        </section>
      )}
      {/* Collection share links: the artist can stop private sharing of this track at any time. */}
      {sharing && !!t.share_ok && !!t.share_terms && t.share_terms !== "owner" && <StopSharing token={token} receiver={who.split(/\s+/)[0]} />}

      <section aria-labelledby="history-h" className="panel overflow-hidden">
        <h2 id="history-h" className="px-4 py-3 text-[15px] font-bold text-bone sm:px-5">What&apos;s happened</h2>
        {/* The live refresh brings new steps in; one that arrives during this visit marks itself with a ring once. */}
        <ReachedSteps reached={happened.map((s) => s.key)}>
        <ol>
          {happened.map((s) => (
            <li key={s.key} className="flex items-start gap-3 border-t border-line px-4 py-3 sm:px-5">
              <SignalDot step={s.key} className={`mt-[6px] size-[10px] shrink-0 rounded-full ${s.key === newest ? "bg-lime" : "bg-bone"}`} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className={`text-sm leading-[22px] text-bone ${s.meaningful ? "font-bold" : ""}`}>{s.label}</p>
                {s.note && <p className="text-[13px] text-mute">{s.note}</p>}
              </div>
              <span className="shrink-0 font-mono text-xs leading-[22px] text-mute tnum">{fmtDate(s.at!)}</span>
            </li>
          ))}
          {pending.map((s) => (
            <li key={s.key} className="flex items-start gap-3 border-t border-line px-4 py-3 sm:px-5">
              <span aria-hidden className="mt-[6px] size-[10px] shrink-0 rounded-full border border-faint" />
              <p className="flex-1 text-sm leading-[22px] text-faint">
                {s.label}
                <span className="sr-only"> (not yet)</span>
              </p>
              <span aria-hidden className="font-mono text-xs leading-[22px] text-faint">Not yet</span>
            </li>
          ))}
        </ol>
        </ReachedSteps>
        <details className="group border-t border-line px-4 sm:px-5">
          <summary className={summary}>
            <Chevron /> What these mean
          </summary>
          <dl className="flex flex-col gap-2 pb-4 text-[13px] text-mute">
            {steps.filter((s) => s.means).map((s) => (
              <div key={s.key}>
                <dt className="font-semibold text-bone">{s.label}</dt>
                <dd>{s.means}</dd>
              </div>
            ))}
            <div>
              <dt className="font-semibold text-bone">Kept or not</dt>
              <dd>{SIGNALS.kept}.</dd>
            </div>
          </dl>
        </details>
      </section>

      <details className="group">
        <summary className={summary}>
          <Chevron /> Details
        </summary>
        <div className="flex flex-col gap-2 pb-2 text-[13px] text-mute">
          <p>
            Updates go to <span className="text-bone">{t.sender_email}</span>{t.verified_at ? " (confirmed)." : "."}
          </p>
          <p>
            <span {...panel("private_note", "Keep {receiver} as it is: the page fills in the receiver's name.")}>{fill(c.private_note, { receiver: who })}</span>
          </p>
          <p>
            {`Files are deleted within ${RETAIN_UNREVIEWED_DAYS} days of delivery unless ${who} keeps them.`}
          </p>
          <p {...panel("footer", "Words in [square brackets] link to the sender's history page.")}>
            {c.footer.split(/(\[[^\]]+\])/).map((part, i) =>
              /^\[.+\]$/.test(part) ? (
                <Link key={i} href="/sent" className="text-bone underline underline-offset-4">
                  {part.slice(1, -1)}
                </Link>
              ) : (
                part
              ),
            )}
          </p>
        </div>
      </details>
      <LivePulse url={`/api/pulse/receipt/${token}`} every={8000} />
      {takingSends && (
        <Link href={`/${t.receiver_handle}`} className="btn-ghost btn-sm w-fit">
          Send another to {who}
        </Link>
      )}
      <footer className="mt-auto flex flex-col items-center gap-3 pt-4">
        {/* Senders are how FloorTest grows: one quiet invitation, only to senders without an account. */}
        {invite && (
          <p className="text-center text-[13px] leading-5 text-faint">
            DJ too?{" "}
            <Link href={invite} className="py-3 text-mute underline underline-offset-4 hover:text-bone">
              Get your own link
            </Link>
            , so music sent to you arrives like this.
          </p>
        )}
        <Logo small />
      </footer>
    </main>
    </EditablePage>
  );
}

const summary = "inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm text-mute hover:text-bone [&::-webkit-details-marker]:hidden";

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
