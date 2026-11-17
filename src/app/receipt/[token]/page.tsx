import Link from "next/link";
import { gateLock } from "@/lib/site-gate";
import { Logo } from "@/components/Logo";
import { siteEditor } from "@/lib/site-editor";
import { EditablePage, editable } from "@/components/Editable";
import { notFound } from "next/navigation";
import { LivePulse } from "@/components/LivePulse";
import { fill, siteCopy } from "@/lib/content";
import { Waveform } from "@/components/Waveform";
import { receiptByToken, receiptLifeByToken } from "@/lib/receipt";
import { ReceiptClosed } from "./ReceiptClosed";
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
import { CARD, Icon } from "@/components/Kit";
import { CuePoint } from "@/components/CuePoint";
import { maskEmail } from "@/lib/mask-email";
import { receiptProven } from "@/lib/receipt-proof";
import { ShowDetails } from "./ShowDetails";
import { BarGap, Disc, LABEL, PAGE, PinnedBar, QUIET } from "./ReceiptParts";

export const metadata = { title: "Your receipt — FloorTest", robots: { index: false } };

/**
 * A sender's receipt. It answers, in this order: did they listen, when, what else has happened, what it means,
 * and is there anything to do. The receiver's keep/pass decision is private and never appears here.
 *
 * With the link alone (owner, 2 Nov, Option B) it shows only what happened and when, and the sender's email masked.
 * The track, the receiver, the callout, the played-out note, the waveform, stems, stop sharing and "Send another" need
 * proof of being the sender (src/lib/receipt-proof.ts), checked here on the server: until then they aren't rendered,
 * so they're in neither the HTML nor the data React loads with it.
 */
export default async function Receipt({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await receiptByToken(token);
  if (!t) notFound();
  // 90 days after the track's final outcome the link shows only that it closed; from the outcome it's read-only
  // (src/lib/receipt-life.ts: worked out so that it never gives the receiver's decision away).
  const status = await receiptLifeByToken(token);
  if (!status || status.life === "closed") return <ReceiptClosed />;
  const open = status.life === "open";
  const proven = await receiptProven(t);

  const [sharing, signupOpen] = await Promise.all([switchOn("sharing"), switchOn("open_signup")]);
  // The invitation shows once the site is public (behind the coming-soon password it would lead to a wall);
  // with sign-up still invite-only it leads to the waitlist.
  const invite = !(await gateLock()) && !t.sender_account ? (signupOpen ? "/signup" : "/#waitlist") : null;
  // Neither the stems request nor the share switch changes when the file leaves the desk: that would give a Not for me away.
  const stemsOn = open && !!t.stems_requested_at && (await featureOn("stems", { id: t.user_id, plan: t.receiver_plan }));
  const [c, editor] = await Promise.all([siteCopy("receipt"), siteEditor()]);
  const { E, panel } = editable(c, !!editor);
  // Without proof the receiver stays unnamed: "the receiver" in every sentence that would name them.
  const who = proven ? t.receiver : "the receiver";
  const Who = proven ? t.receiver : "The receiver";
  // "Send another" only while the receiver's link takes uploads: the same checks as their link page (not paused, the
  // callout open, room on the desk). A suspended account isn't found at all.
  const rcv = proven ? await userByHandleForView(t.receiver_handle) : null;
  const takingSends = !!rcv && !isPaused(rcv) && !isClosed(await activeCollection(rcv)) && !(await capacity(rcv)).full;

  /*
   * The lifecycle, from the track itself. "Meaningful" events are things the receiver did with the music;
   * the rest is the system keeping its promises. Only meaningful ones get the bright treatment.
   */
  type Step = { key: string; label: string; at: number | null; meaningful: boolean; note?: string; means: string };
  const steps: Step[] = [
    { key: "delivered", label: "Delivered", at: t.created_at, meaningful: false, note: `to ${who}'s desk${proven && t.collection ? ` for ${t.collection}` : ""}`, means: "The original file reached the desk safely." },
    { key: "listened", label: "Listened", at: t.played_at, meaningful: true, means: SIGNALS.listened + "." },
    { key: "downloaded", label: "Downloaded", at: t.downloaded_at, meaningful: true, means: SIGNALS.downloaded + "." },
    { key: "replied", label: "Replied", at: t.replied_at, meaningful: true, note: "The message is in your email.", means: SIGNALS.replied + "." },
    { key: "played_out", label: "Played out", at: t.played_out_at, meaningful: true, note: (proven && t.played_out_note) || undefined, means: SIGNALS.playedOut + "." },
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
    ? { status: "played_out", strong: true, title: `${Who} played it out.`, detail: `${proven && t.played_out_note ? `“${t.played_out_note}” · ` : ""}${when(t.played_out_at)}` }
    : t.replied_at
      ? { status: "replied", strong: true, title: `${Who} replied.`, detail: `The message is in your email · ${when(t.replied_at)}` }
      : t.downloaded_at
        ? { status: "downloaded", strong: true, title: `${Who} downloaded it.`, detail: `Listened ${t.played_at ? ago(t.played_at) : "earlier"}, downloaded ${when(t.downloaded_at)}` }
        : t.played_at
          ? { status: "listened", strong: true, title: `${Who} listened.`, detail: when(t.played_at) }
          : unheard
            ? { status: "unheard", strong: false, title: `Not listened to in ${RETAIN_UNREVIEWED_DAYS} days.`, detail: `Delivered ${fmtDay(t.created_at)}. Files leave the desk after ${RETAIN_UNREVIEWED_DAYS} days unless they're kept.` }
            : { status: "waiting", strong: false, title: `Waiting for ${who} to listen.`, detail: `Delivered ${when(t.created_at)}. We'll email you the moment it's listened to.` };

  const todo = proven && (!t.verified_at || stemsOn);
  const first = who.split(/\s+/)[0];
  const masked = maskEmail(t.sender_email);
  // Collection share links: the artist can stop private sharing of this track at any time.
  const sharable = open && proven && sharing && !!t.share_ok && !!t.share_terms && t.share_terms !== "owner";
  const readOnlyLine = !open && status.closesAt ? (
    <p className="max-w-[40ch] text-center text-[12.5px] leading-[1.5] text-mute">
      This receipt is read-only now: nothing more can be sent or changed from it. The link closes on {fmtDay(status.closesAt)}.
    </p>
  ) : null;

  /*
   * Laid out like a payment receipt (owner, 17 Nov): the status first and centred, then the track and the steps, and
   * the screen's action in a bar at the bottom (pinned on phones, in the flow from 640px). One lime thing per screen:
   * the newest step's dot, or Show my details.
   */
  const body = (
    <>
      <header className="flex flex-col items-center gap-3 px-2 pb-2 pt-3 sm:pt-0">
        <p className="flex items-center gap-1.5 text-[11.5px] text-mute">
          <Icon name="lock" className="size-[15px]" />
          <E k="kicker" />
        </p>
        <StatusHeadline status={headline.status} title={headline.title} detail={headline.detail} strong={headline.strong} icon={<Disc status={headline.status} strong={headline.strong} />} />
      </header>

      {!proven && (
        <p className={`${CARD} p-3.5 text-[13px] leading-5 text-mute`}>
          The track, who it went to and their note show only to you. We&apos;ll email a code to <span className="text-bone">{masked}</span>.
        </p>
      )}
      {proven && (
        <div className={`${CARD} flex flex-col gap-3 p-3`}>
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[12px] border border-line bg-well text-mute">
              <Icon name="music" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-bone">{t.title}</p>
              <p className="text-[13px] leading-[1.4] text-mute">
                {t.artist}
                {t.duration ? ` · ${fmtTime(t.duration)}` : ""} · to {who}
                {t.receiver_status === "verified" && <CuePoint size={16} label="Verified by FloorTest: this account controls the linked profile" className="-mt-0.5 ml-1" />}
                {t.collection ? ` for ${t.collection}` : ""}
              </p>
            </div>
          </div>
          {t.peaks && <Waveform peaks={JSON.parse(t.peaks)} height={32} />}
        </div>
      )}

      {todo && (
        <section aria-labelledby="todo-h" className={`${CARD} flex flex-col gap-2.5 p-3.5`}>
          <h2 id="todo-h" className={LABEL}>
            <E k="todo_title" />
          </h2>
          {stemsOn && <StemUpload token={token} receiver={first} existing={stemsSent(t)} max={MAX_STEMS} />}
          {!t.verified_at && (
            <p className="text-[13px] leading-5 text-mute">
              Confirm your email from the delivery email, so {who} sees you as verified. Updates go to <span className="text-bone">{masked}</span>.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="history-h" className={`${CARD} flex flex-col gap-1.5 px-3.5 pb-1 pt-3.5`}>
        <h2 id="history-h" className={LABEL}>
          <E k="history_title" />
        </h2>
        {/* The live refresh below brings new steps in; one that arrives during this visit marks itself with a ring once. */}
        <ReachedSteps reached={happened.map((s) => s.key)}>
        <ol className="flex flex-col">
          {happened.map((s, i) => (
            <li key={s.key} className="relative flex gap-3 py-2">
              {(i < happened.length - 1 || pending.length > 0) && <span aria-hidden className="absolute left-[5px] top-6 h-[calc(100%-12px)] w-0.5 bg-line-2" />}
              <SignalDot step={s.key} className={`z-[1] mt-1 size-3 shrink-0 rounded-full ${s.key === newest ? "bg-(--color-lime)" : "bg-bone"}`} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-[14px] leading-5 text-bone">
                  <span className="font-semibold">{s.label}</span>
                  <span className="text-mute tnum"> · {fmtDate(s.at!)}</span>
                </p>
                {s.note && <p className="text-[12px] leading-[1.45] text-mute">{s.note}</p>}
              </div>
            </li>
          ))}
          {pending.map((s, i) => (
            <li key={s.key} className="relative flex gap-3 py-2">
              {i < pending.length - 1 && <span aria-hidden className="absolute left-[5px] top-6 h-[calc(100%-12px)] w-0.5 bg-line-2" />}
              <span aria-hidden className="relative z-[1] mt-1 size-3 shrink-0 rounded-full border-[1.5px] border-line-2 bg-card" />
              <p className="text-[14px] leading-5 text-faint">
                {s.label}
                <span className="sr-only"> (not yet)</span>
              </p>
            </li>
          ))}
        </ol>
        </ReachedSteps>
        <details className="group mt-1 border-t border-line text-[12px] text-dim">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-semibold text-bone [&::-webkit-details-marker]:hidden">
            <E k="means_title" />
            <Icon name="plus" className="size-4 text-mute transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none" />
          </summary>
          <dl className="mb-3 flex flex-col gap-2 border-l border-line-2 pl-3">
            {steps.filter((s) => s.means).map((s) => (
              <div key={s.key}>
                <dt className="font-semibold text-mute">{s.label}</dt>
                <dd>{s.means}</dd>
              </div>
            ))}
            <div>
              <dt className="font-semibold text-mute">Kept or not</dt>
              <dd>{SIGNALS.kept}.</dd>
            </div>
          </dl>
        </details>
      </section>

      <details className={`${CARD} group px-3.5 text-[12px] text-dim`}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-semibold text-bone [&::-webkit-details-marker]:hidden">
          <E k="details_title" />
          <Icon name="plus" className="size-4 text-mute transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none" />
        </summary>
        <div className="mb-3.5 flex flex-col gap-2 border-l border-line-2 pl-3 leading-[1.45]">
          <p>
            Updates go to <span className="text-mute">{masked}</span>{t.verified_at ? " (confirmed)." : "."}
          </p>
          {sharable && <p>{first} may share this track privately with people they name, who must confirm their email first.</p>}
          <p>
            <span {...panel("private_note", "Keep {receiver} as it is: the page fills in the receiver's name.")}>{fill(c.private_note, { receiver: who })}</span>
          </p>
          <p>
            <span {...panel("retention_note", "Keep {days} and {receiver} as they are: the page fills them in.")}>{fill(c.retention_note, { days: RETAIN_UNREVIEWED_DAYS, receiver: who })}</span>
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

      {/* Senders are how FloorTest grows: one quiet invitation, only to senders without an account. */}
      {invite && (
        <p className="pt-2 text-center text-[12px] leading-[18px] text-dim">
          <E k="invite_prompt" />{" "}
          <Link href={invite} className="py-3 text-mute underline underline-offset-4 hover:text-bone">
            <E k="invite_link" />
          </Link>
          <E k="invite_after" />
        </p>
      )}
      {/* Without proof the bar holds Show my details, so the read-only line stays in the page. */}
      {!proven && readOnlyLine && <div className="flex justify-center px-2 pt-2">{readOnlyLine}</div>}
    </>
  );
  const foot = (
    <footer className="flex justify-center pt-5 sm:mt-auto sm:pt-8">
      <Logo small />
    </footer>
  );

  return (
    <EditablePage editing={!!editor} page="receipt" label="Receipts" values={c}>
    <main className={PAGE}>
      {proven ? (
        <>
          {body}
          {readOnlyLine ? (
            <PinnedBar>{readOnlyLine}</PinnedBar>
          ) : takingSends || sharable ? (
            <PinnedBar>
              {takingSends && (
                <Link href={`/${t.receiver_handle}`} className={QUIET}>
                  Send another to {who}
                </Link>
              )}
              {sharable && <StopSharing token={token} receiver={first} />}
            </PinnedBar>
          ) : (
            <BarGap />
          )}
          {foot}
        </>
      ) : (
        <ShowDetails token={token} masked={masked} foot={foot}>
          {body}
        </ShowDetails>
      )}
      <LivePulse url={`/api/pulse/receipt/${token}`} every={8000} />
    </main>
    </EditablePage>
  );
}
