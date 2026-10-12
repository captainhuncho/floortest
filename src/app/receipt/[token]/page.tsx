import Link from "next/link";
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
import { switchOn } from "@/lib/switches";
import { StopSharing } from "./StopSharing";

export const metadata = { title: "Your receipt — FloorTest", robots: { index: false } };

/**
 * A sender's receipt. It answers, in this order: did they listen, when, what else has happened, what it means,
 * and is there anything to do. The receiver's keep/pass decision is private and never appears here.
 */
export default async function Receipt({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = (await q.get<(Track & { receiver: string; receiver_plan: string; collection: string | null; sender_email: string; verified_at: number | null })>(`SELECT t.*, u.name AS receiver, u.plan AS receiver_plan, c.name AS collection, s.email AS sender_email, s.verified_at
       FROM tracks t JOIN users u ON u.id = t.user_id JOIN senders s ON s.id = t.sender_id
       LEFT JOIN collections c ON c.id = t.collection_id
       WHERE t.token = ?`, token));
  if (!t) notFound();

  const sharing = await switchOn("sharing");
  // Neither the stems request nor the share switch changes when the file leaves the desk: that would give a Not for me away.
  const stemsOn = !!t.stems_requested_at && (await featureOn("stems", { id: t.user_id, plan: t.receiver_plan }));
  const [c, editor] = await Promise.all([siteCopy("receipt"), siteEditor()]);
  const { E, panel } = editable(c, !!editor);
  const who = t.receiver;

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
  const unheard = unheardAfterWindow(t);
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
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-8 bg-ink px-5 py-8 text-bone sm:py-12">
      <header className="flex flex-col gap-5">
        <p className="eyebrow"><E k="kicker" /></p>
        <StatusHeadline status={headline.status} title={headline.title} detail={headline.detail} strong={headline.strong} />
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="min-w-0 truncate text-[14px] font-semibold text-bone">
            {t.title} <span className="font-normal text-mute">· {t.artist}{t.duration ? ` · ${fmtTime(t.duration)}` : ""}</span>
          </p>
          {t.peaks && <Waveform peaks={JSON.parse(t.peaks)} height={32} />}
        </div>
      </header>

      {todo && (
        <section aria-labelledby="todo-h" className="flex flex-col gap-3">
          <h2 id="todo-h" className="eyebrow">For you</h2>
          {stemsOn && <StemUpload token={token} receiver={who.split(/\s+/)[0]} existing={stemsSent(t)} max={MAX_STEMS} />}
          {!t.verified_at && (
            <p className="text-[13px] text-mute">
              Confirm your email from the delivery email, so {who} sees you as verified. Updates go to <span className="text-bone">{t.sender_email}</span>.
            </p>
          )}
        </section>
      )}
      {/* Collection share links: the artist can stop private sharing of this track at any time. */}
      {sharing && !!t.share_ok && !!t.share_terms && t.share_terms !== "owner" && <StopSharing token={token} receiver={who.split(/\s+/)[0]} />}

      <section aria-labelledby="history-h" className="flex flex-col gap-3">
        <h2 id="history-h" className="eyebrow">What&apos;s happened</h2>
        <ol className="flex flex-col">
          {happened.map((s, i) => (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {(i < happened.length - 1 || pending.length > 0) && <span aria-hidden className="absolute left-[5px] top-4 h-[calc(100%-8px)] w-px bg-line" />}
              <span aria-hidden className={`mt-[7px] size-[11px] shrink-0 rounded-full ${s.meaningful ? "bg-lime" : "border border-line-2 bg-ink"}`} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className={`text-[14px] leading-6 ${s.meaningful ? "font-bold text-bone" : "text-mute"}`}>
                  {s.label}
                  <span className="ml-2 text-[12px] font-normal text-dim tnum">{fmtDate(s.at!)}</span>
                </p>
                {s.note && <p className={`text-[12px] ${s.meaningful ? "text-mute" : "text-dim"}`}>{s.note}</p>}
              </div>
            </li>
          ))}
          {pending.map((s, i) => (
            <li key={s.key} className="relative flex gap-3 pb-3 last:pb-0">
              {i < pending.length - 1 && <span aria-hidden className="absolute left-[5px] top-4 h-[calc(100%-8px)] w-px bg-line" />}
              <span aria-hidden className="mt-[7px] size-[11px] shrink-0 rounded-full border border-line bg-ink" />
              <p className="text-[13px] leading-6 text-faint">
                {s.label}
                <span className="sr-only"> (not yet)</span>
              </p>
            </li>
          ))}
        </ol>
        <details className="group text-[12px] text-dim">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-bone underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="text-lime transition-transform duration-150 group-open:rotate-45">+</span> What these mean
          </summary>
          <dl className="mt-2 flex flex-col gap-2 border-l border-line pl-3">
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

      <details className="group text-[12px] text-dim">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-bone underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="text-lime transition-transform duration-150 group-open:rotate-45">+</span> Details
        </summary>
        <div className="mt-2 flex flex-col gap-2 border-l border-line pl-3">
          <p>
            Updates go to <span className="text-mute">{t.sender_email}</span>{t.verified_at ? " (confirmed)." : "."}
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
      <footer className="mt-auto flex justify-center pt-4">
        <Logo small />
      </footer>
    </main>
    </EditablePage>
  );
}
