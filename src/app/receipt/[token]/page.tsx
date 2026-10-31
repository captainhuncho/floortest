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
import { CARD, Cover, Icon, initials } from "@/components/Kit";
import { CuePoint } from "@/components/CuePoint";

export const metadata = { title: "Your receipt — FloorTest", robots: { index: false } };

/**
 * A sender's receipt. It answers, in this order: did they listen, when, what else has happened, what it means,
 * and is there anything to do. The receiver's keep/pass decision is private and never appears here.
 */
export default async function Receipt({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = (await q.get<(Track & { receiver: string; receiver_plan: string; collection: string | null; sender_email: string; verified_at: number | null; sender_account: number | null; receiver_handle: string; receiver_status: string | null })>(`SELECT t.*, u.name AS receiver, u.handle AS receiver_handle, u.identity_status AS receiver_status, u.plan AS receiver_plan, c.name AS collection, s.email AS sender_email, s.verified_at, s.account_id AS sender_account
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
    {/* Light or dark with the visitor's device, like the link page; one ~600px column of cards in the desk's look (owner, 30 Oct). */}
    <main className="theme-system mx-auto flex min-h-dvh max-w-[600px] flex-col gap-3 bg-ink px-3.5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-bone sm:px-6 sm:pt-10">
      <header className={`${CARD} flex flex-col gap-3 p-3`}>
        <p className="flex items-center gap-1.5 text-[11.5px] text-mute">
          <Icon name="lock" className="size-[15px]" />
          <E k="kicker" />
        </p>
        <StatusHeadline status={headline.status} title={headline.title} detail={headline.detail} strong={headline.strong} />
        <div className="flex flex-col gap-2.5 border-t border-dashed border-line-2 pt-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Cover text={initials(t.title)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-bone">{t.title}</p>
              <p className="text-[11.5px] leading-[1.4] text-mute">
                {t.artist}
                {t.duration ? ` · ${fmtTime(t.duration)}` : ""} · to {who}
                {t.receiver_status === "verified" && <CuePoint size={16} label="Verified by FloorTest: this account controls the linked profile" className="-mt-0.5 ml-1" />}
                {t.collection ? ` for ${t.collection}` : ""}
              </p>
            </div>
          </div>
          {t.peaks && <Waveform peaks={JSON.parse(t.peaks)} height={32} />}
        </div>
      </header>

      {todo && (
        <section aria-labelledby="todo-h" className={`${CARD} flex flex-col gap-2.5 p-3`}>
          <h2 id="todo-h" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-well text-[#d98a2b]">
              <Icon name="mail" className="size-4" />
            </span>
            <E k="todo_title" />
          </h2>
          {stemsOn && <StemUpload token={token} receiver={who.split(/\s+/)[0]} existing={stemsSent(t)} max={MAX_STEMS} />}
          {!t.verified_at && (
            <p className="text-[13px] leading-5 text-mute">
              Confirm your email from the delivery email, so {who} sees you as verified. Updates go to <span className="text-bone">{t.sender_email}</span>.
            </p>
          )}
        </section>
      )}
      {/* Collection share links: the artist can stop private sharing of this track at any time. */}
      {sharing && !!t.share_ok && !!t.share_terms && t.share_terms !== "owner" && (
        <div className={`${CARD} p-3`}>
          <StopSharing token={token} receiver={who.split(/\s+/)[0]} />
        </div>
      )}

      <section aria-labelledby="history-h" className={`${CARD} flex flex-col gap-3 p-3`}>
        <h2 id="history-h" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-well">
            <Icon name="activity" className="size-4" />
          </span>
          <E k="history_title" />
        </h2>
        {/* The live refresh above brings new steps in; one that arrives during this visit marks itself with a ring once. */}
        <ReachedSteps reached={happened.map((s) => s.key)}>
        <ol className="flex flex-col">
          {happened.map((s, i) => (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {(i < happened.length - 1 || pending.length > 0) && <span aria-hidden className="absolute left-[5.5px] top-4 h-[calc(100%-8px)] w-px bg-line-2" />}
              <SignalDot step={s.key} className={`mt-[6px] size-3 shrink-0 rounded-full ${s.key === newest ? "bg-(--color-lime) shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-lime)_14%,transparent)]" : "bg-bone"}`} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className={`text-[13.5px] leading-6 text-bone ${s.meaningful ? "font-semibold" : "font-medium"}`}>
                  {s.label}
                  <span className="ml-2 text-[11.5px] font-normal text-dim tnum">{fmtDate(s.at!)}</span>
                </p>
                {s.note && <p className="text-[12px] leading-[1.45] text-mute">{s.note}</p>}
              </div>
            </li>
          ))}
          {pending.map((s, i) => (
            <li key={s.key} className="relative flex gap-3 pb-3 last:pb-0">
              {i < pending.length - 1 && <span aria-hidden className="absolute left-[5.5px] top-4 h-[calc(100%-8px)] w-px bg-line-2" />}
              <span aria-hidden className="mt-[6px] size-3 shrink-0 rounded-full border-[1.5px] border-line-2 bg-ink" />
              <p className="text-[13px] leading-6 text-faint">
                {s.label}
                <span className="sr-only"> (not yet)</span>
              </p>
            </li>
          ))}
        </ol>
        </ReachedSteps>
        <details className="group border-t border-dashed border-line-2 pt-1 text-[12px] text-dim">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[12.5px] font-semibold text-bone [&::-webkit-details-marker]:hidden">
            <E k="means_title" />
            <Icon name="plus" className="size-4 text-mute transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none" />
          </summary>
          <dl className="mb-1 flex flex-col gap-2 border-l border-line-2 pl-3">
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

      <details className={`${CARD} group px-3 py-1 text-[12px] text-dim`}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[12.5px] font-semibold text-bone [&::-webkit-details-marker]:hidden">
          <E k="details_title" />
          <Icon name="plus" className="size-4 text-mute transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none" />
        </summary>
        <div className="mb-2.5 flex flex-col gap-2 border-l border-line-2 pl-3 leading-[1.45]">
          <p>
            Updates go to <span className="text-mute">{t.sender_email}</span>{t.verified_at ? " (confirmed)." : "."}
          </p>
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
      <LivePulse url={`/api/pulse/receipt/${token}`} every={8000} />
      {takingSends && (
        <Link href={`/${t.receiver_handle}`} className="flex min-h-12 items-center justify-center gap-2 rounded-[13px] border border-line-2 bg-card px-4 text-[13.5px] font-semibold text-bone hover:bg-well">
          <Icon name="send" className="size-4" />
          Send another to {who}
        </Link>
      )}
      <footer className="mt-auto flex flex-col items-center gap-3 pt-6">
        {/* Senders are how FloorTest grows: one quiet invitation, only to senders without an account. */}
        {invite && (
          <p className="text-center text-[12px] leading-[18px] text-dim">
            <E k="invite_prompt" />{" "}
            <Link href={invite} className="py-3 text-mute underline underline-offset-4 hover:text-bone">
              <E k="invite_link" />
            </Link>
            <E k="invite_after" />
          </p>
        )}
        <Logo small />
      </footer>
    </main>
    </EditablePage>
  );
}
