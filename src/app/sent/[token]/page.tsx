import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Kit";
import { q } from "@/lib/db";
import { ago } from "@/lib/format";
import { redirect } from "next/navigation";
import { readSenderLink, revokeSenderLink } from "@/lib/senderLink";
import { RETAIN_UNREVIEWED_DAYS, unheardAfterWindow } from "@/lib/plans";
import { maskEmail } from "@/lib/mask-email";
import { receiptPath } from "@/lib/receipt-token";
import { countsLine, isListened, isWaiting } from "@/lib/sent-groups";
import { Disc, QUIET, SENT_MAIN } from "../parts";
import { SentList, type SentRow } from "./SentList";

export const metadata = { title: "Your sends — FloorTest", robots: { index: false } };

/** Every track a sender has sent, across receivers. Only the signals senders are promised; decisions stay private. */
export default async function SenderHistory({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const email = await readSenderLink(token);
  // Anyone holding the link can end it early (a forwarded email, a shared screen); it then shows as expired.
  async function endLink() {
    "use server";
    await revokeSenderLink(token);
    redirect(`/sent/${encodeURIComponent(token)}`);
  }
  if (!email)
    return (
      <main className={SENT_MAIN}>
        <Logo className="self-center" />
        {/* One centred group, the way back right under the words. */}
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 pb-10 text-center">
          <Disc icon="clock" dim />
          <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-dim">This link has expired</h1>
          <p className="max-w-[30ch] text-[13px] leading-5 text-mute">Links work for 24 hours, or until they&apos;re ended.</p>
          <Link href="/sent" className="btn-lime min-h-12 min-w-[220px] rounded-full px-[22px] text-[14.5px] font-bold">
            Email me a new link
          </Link>
        </div>
      </main>
    );
  const rows = await q.all<{
    id: number; token_sealed: string | null; title: string; artist: string; created_at: number; played_at: number | null; downloaded_at: number | null;
    replied_at: number | null; played_out_at: number | null; receiver: string;
  }>(
    `SELECT t.id, t.token_sealed, t.title, t.artist, t.created_at, t.played_at, t.downloaded_at, t.replied_at, t.played_out_at, u.name AS receiver
     FROM tracks t JOIN senders s ON s.id = t.sender_id JOIN users u ON u.id = t.user_id
     WHERE lower(s.email) = ? AND u.suspended_at IS NULL ORDER BY t.created_at DESC LIMIT 300`,
    email,
  );
  // The strongest thing that has happened, and when. Lit (lime) from delivery on, like the receipt; only a track unheard for
  // 90 days stays dim.
  const status = (r: (typeof rows)[number]): [string, boolean, number] =>
    r.played_out_at ? ["Played out", true, r.played_out_at] : r.replied_at ? ["Replied", true, r.replied_at] : r.downloaded_at ? ["Downloaded", true, r.downloaded_at] : r.played_at ? ["Listened", true, r.played_at] : unheardAfterWindow(r) ? [`Not listened to in ${RETAIN_UNREVIEWED_DAYS} days`, false, r.created_at] : ["Delivered", true, r.created_at];
  // What the list in the browser gets: the words each row prints and the three values its grouping and chips read.
  // No track id, sealed token or raw timestamps of what the receiver did.
  const now = Date.now();
  const sends: SentRow[] = rows.map((r) => {
    const [label, lit, at] = status(r);
    return {
      href: receiptPath(r),
      title: r.title,
      receiver: r.receiver,
      label,
      lit,
      when: lit ? ago(at, now) : null,
      sentAt: r.created_at,
      listened: isListened(r),
      waiting: isWaiting(r, unheardAfterWindow(r, now)),
    };
  });

  return (
    <main className={SENT_MAIN}>
      <header className="flex flex-col gap-1.5 px-0.5 pt-3">
        <p className="flex items-center gap-1.5 text-[12px] text-mute">
          <Icon name="lock" className="size-3.5" />
          {/* Masked: the link gets forwarded and screenshotted; the address it came to is enough for the sender to recognise it. */}
          <span className="min-w-0 truncate">Private · {maskEmail(email)}</span>
        </p>
        <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em]">Everything you&apos;ve sent</h1>
        <p className="text-[13px] text-mute tnum">{countsLine(sends)}</p>
      </header>
      {sends.length ? (
        <SentList rows={sends} now={now} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Disc icon="music" dim small />
          <p className="max-w-[30ch] text-[13px] leading-5 text-mute">Nothing sent yet. Send a track through a receiver&apos;s link and it will show here.</p>
        </div>
      )}
      <form action={endLink} className="flex flex-col items-center gap-1.5 pb-1.5 pt-3.5 text-center">
        <button className={QUIET}>End this link now</button>
        <p className="text-[12px] text-dim">It stops working straight away. You can always email yourself a new one.</p>
      </form>
    </main>
  );
}
