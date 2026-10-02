import { notFound } from "next/navigation";
import { Waveform } from "@/components/Waveform";
import {q, type Track } from "@/lib/db";
import { fmtDate, fmtDay, fmtTime } from "@/lib/format";
import { RETAIN_UNREVIEWED_DAYS, SIGNALS } from "@/lib/plans";
import { featureOn } from "@/lib/features";
import { MAX_STEMS, stemsFor } from "@/lib/stems";
import { StemUpload } from "./StemUpload";
import { ShareConsent } from "./ShareConsent";
import { CancelConsent } from "./CancelConsent";
import { switchOn } from "@/lib/switches";
import { finalizeConsent } from "@/lib/share";
import { consentFinalAt, latestShareRequest } from "@/lib/share";

/** Long enough for the post-Allow wait (see actions.ts). */

export const metadata = { title: "Your receipt — FloorTest", robots: { index: false } };

export default async function Receipt({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = (await q.get<(Track & { receiver: string; receiver_plan: string; collection: string | null; sender_email: string; verified_at: number | null })>(`SELECT t.*, u.name AS receiver, u.plan AS receiver_plan, c.name AS collection, s.email AS sender_email, s.verified_at
       FROM tracks t JOIN users u ON u.id = t.user_id JOIN senders s ON s.id = t.sender_id
       LEFT JOIN collections c ON c.id = t.collection_id
       WHERE t.token = ?`, token));
  if (!t) notFound();

  const shared = await q.get<{ at: number }>("SELECT MIN(created_at) AS at FROM track_shares WHERE track_id = ?", t.id);
  // Opening the receipt after the cancel window is one of the places a consent becomes final.
  const sharing = await switchOn("sharing");
  if (sharing && !t.deleted_at && !t.share_ok) await finalizeConsent(t.id);
  const request = sharing && !t.deleted_at ? await latestShareRequest(t.id) : undefined;
  const stemsOn = !!t.stems_requested_at && !t.deleted_at && (await featureOn("stems", { id: t.user_id, plan: t.receiver_plan }));
  const stems = stemsOn ? await stemsFor(t.id) : [];
  // Kept and passed are private to the receiver. Senders only see what they were promised.
  const steps = [
    { label: "Delivered", at: t.created_at, text: `On ${t.receiver}'s desk${t.collection ? ` for ${t.collection}` : ""}` },
    { label: "Listened", at: t.played_at, text: SIGNALS.listened },
    { label: "Downloaded", at: t.downloaded_at, text: SIGNALS.downloaded },
    { label: "Replied", at: t.replied_at, text: `${t.receiver} sent you a message. Check your email.` },
    { label: "Played out", at: t.played_out_at, text: t.played_out_note ? `${SIGNALS.playedOut}: ${t.played_out_note}` : SIGNALS.playedOut },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 bg-ink px-5 py-8 text-bone sm:py-12">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-bold uppercase tracking-[1px] text-faint">Private receipt</p>
        <h1 className="break-words text-[28px] font-bold tracking-[-0.8px]">{t.title}</h1>
        <p className="text-[11px] text-mute">
          {t.artist} · sent to {t.receiver}
          {t.duration ? ` · ${fmtTime(t.duration)}` : ""}
        </p>
      </div>
      {t.peaks && (
        <div className="rounded-xl border border-line bg-ink-3 px-1 py-1">
          <Waveform peaks={JSON.parse(t.peaks)} height={48} />
        </div>
      )}
      <ol className="rounded-2xl border border-line bg-ink-3 p-4">
        {steps.map((s, i) => {
          const done = !!s.at;
          return (
            <li key={s.label} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 && <span className="absolute left-[9px] top-5 h-[calc(100%-20px)] w-0.5 rounded-[1px] bg-line" />}
              <span
                aria-hidden
                className={`grid size-5 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                  done ? "bg-line text-lime" : "bg-line"
                }`}
              >
                {done ? "✓" : <span className="size-1.5 rounded-full bg-ink" />}
              </span>
              <div className="min-w-0 pt-px">
                <p className={`text-[12px] font-bold ${done ? "" : "text-faint"}`}>
                  {s.label} <span className="sr-only">{done ? "(done)" : "(not yet)"}</span>
                </p>
                <p className={`text-[11px] ${done ? "text-faint" : "text-faint"}`}>
                  {done ? `${fmtDate(s.at!)} · ${s.text}` : `Not yet · ${s.text}`}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {request?.status === "pending" && (
        <ShareConsent token={token} requestId={request.id} receiver={t.receiver.split(/\s+/)[0]} note={request.note} downloads={!!request.downloads} />
      )}
      {request?.status === "allowed" && (
        <CancelConsent token={token} requestId={request.id} receiver={t.receiver.split(/\s+/)[0]} finalAt={consentFinalAt(request)} />
      )}

      {stemsOn && (
        <StemUpload token={token} receiver={t.receiver.split(/\s+/)[0]} existing={stems.map((x) => x.name)} max={MAX_STEMS} />
      )}

      <section className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-ink-2 p-3.5 text-[11px] text-faint">
        <p>
          Updates go to <span className="font-bold text-mute">{t.sender_email}</span>
          {t.verified_at ? " (confirmed)." : ". Confirm your email from the delivery email so the receiver sees you as verified."}
        </p>
        <hr className="border-line" />
        <p>
          Only {t.receiver} can hear or download your file. It&apos;s never shared publicly.
          {shared?.at ? ` ${t.receiver} shared a private link with a colleague on ${fmtDay(shared.at)}.` : ""}
          {request && request.status !== "pending" && request.decided_at
            ? ` You ${request.status === "allowed" ? "allowed" : request.status === "cancelled" ? "cancelled" : "declined"} sharing on ${fmtDay(request.decided_at)}.`
            : ""}
        </p>
        <hr className="border-line" />
        <p>
          {t.deleted_at
            ? `The file was deleted on ${fmtDay(t.deleted_at)}.`
            : `Files are deleted within ${RETAIN_UNREVIEWED_DAYS} days of delivery unless ${t.receiver} keeps them.`}
        </p>
      </section>
      <p className="text-[11px] text-faint">
        No account needed. Bookmark this page to check in any time, or{" "}
        <a href="/sent" className="text-faint underline">
          see everything you&apos;ve sent
        </a>
        .
      </p>
    </main>
  );
}
