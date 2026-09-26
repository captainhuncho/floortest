import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Waveform } from "@/components/Waveform";
import { db, type Track } from "@/lib/db";
import { fmtDate, fmtDay, fmtTime } from "@/lib/format";
import { RETAIN_UNREVIEWED_DAYS, SIGNALS } from "@/lib/plans";

export const metadata = { title: "Your receipt — FloorTest", robots: { index: false } };

export default async function Receipt({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = db()
    .prepare(
      `SELECT t.*, u.name AS receiver, c.name AS collection, s.email AS sender_email, s.verified_at
       FROM tracks t JOIN users u ON u.id = t.user_id JOIN senders s ON s.id = t.sender_id
       LEFT JOIN collections c ON c.id = t.collection_id
       WHERE t.token = ?`,
    )
    .get(token) as (Track & { receiver: string; collection: string | null; sender_email: string; verified_at: number | null }) | undefined;
  if (!t) notFound();

  // Kept and passed are private to the receiver. Senders only see what they were promised.
  const steps = [
    { label: "Delivered", at: t.created_at, text: `On ${t.receiver}'s desk${t.collection ? ` for ${t.collection}` : ""}` },
    { label: "Listened", at: t.played_at, text: SIGNALS.listened },
    { label: "Downloaded", at: t.downloaded_at, text: SIGNALS.downloaded },
    { label: "Replied", at: t.replied_at, text: `${t.receiver} sent you a message. Check your email.` },
  ];

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <Logo className="mb-12" />
      <p className="label">Private receipt</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{t.title}</h1>
      <p className="text-mute">
        {t.artist} · sent to {t.receiver}
        {t.duration ? ` · ${fmtTime(t.duration)}` : ""}
      </p>
      {t.peaks && (
        <div className="mt-8">
          <Waveform peaks={JSON.parse(t.peaks)} height={48} dim />
        </div>
      )}
      <ol className="mt-10">
        {steps.map((s, i) => {
          const done = !!s.at;
          return (
            <li key={s.label} className="relative flex gap-4 pb-7 last:pb-0">
              {i < steps.length - 1 && <span className="absolute left-[9px] top-6 h-[calc(100%-12px)] w-px bg-line" />}
              <span
                aria-hidden
                className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[12px] font-bold ${
                  done ? "border-lime bg-lime text-ink" : "border-line bg-ink"
                }`}
              >
                {done ? "✓" : ""}
              </span>
              <div>
                <p className={`font-medium ${done ? "" : "text-mute"}`}>
                  {s.label} <span className="sr-only">{done ? "(done)" : "(not yet)"}</span>
                </p>
                <p className="text-sm text-mute">{done ? `${fmtDate(s.at!)} · ${s.text}` : `Not yet · ${s.text}`}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <section className="mt-10 space-y-2 rounded-lg border border-line p-4 text-sm text-mute">
        <p>
          Updates go to <span className="text-bone">{t.sender_email}</span>
          {t.verified_at ? " (confirmed)." : ". Confirm your email from the delivery email so the receiver sees you as verified."}
        </p>
        <p>Only {t.receiver} can hear or download your file. It&apos;s never shared publicly.</p>
        <p>
          {t.deleted_at
            ? `The file was deleted on ${fmtDay(t.deleted_at)}.`
            : `Files are deleted within ${RETAIN_UNREVIEWED_DAYS} days of delivery unless ${t.receiver} keeps them.`}
        </p>
      </section>
      <p className="mt-6 text-sm text-mute">No account needed. Bookmark this page to check in any time.</p>
    </main>
  );
}
