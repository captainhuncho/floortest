import Link from "next/link";
import { Logo } from "@/components/Logo";
import { CARD, Icon } from "@/components/Kit";
import { q } from "@/lib/db";
import { ago, fmtDay } from "@/lib/format";
import { redirect } from "next/navigation";
import { readSenderLink, revokeSenderLink } from "@/lib/senderLink";
import { RETAIN_UNREVIEWED_DAYS, unheardAfterWindow } from "@/lib/plans";

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
      <main className="theme-system mx-auto flex min-h-dvh max-w-[600px] flex-col gap-3 bg-ink px-3.5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-bone sm:px-6 sm:pt-10">
        <Logo className="mb-3" />
        <section className={`${CARD} flex flex-col gap-3 p-3`}>
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.03em]">This link has expired</h1>
          <p className="text-[13px] leading-5 text-mute">Links work for 24 hours, or until they&apos;re ended.</p>
          <Link href="/sent" className="btn-lime min-h-12 w-fit rounded-[13px] px-5 text-[13.5px]">
            Email me a new link
          </Link>
        </section>
      </main>
    );
  const rows = await q.all<{
    token: string; title: string; artist: string; created_at: number; played_at: number | null; downloaded_at: number | null;
    replied_at: number | null; played_out_at: number | null; receiver: string;
  }>(
    `SELECT t.token, t.title, t.artist, t.created_at, t.played_at, t.downloaded_at, t.replied_at, t.played_out_at, u.name AS receiver
     FROM tracks t JOIN senders s ON s.id = t.sender_id JOIN users u ON u.id = t.user_id
     WHERE lower(s.email) = ? AND u.suspended_at IS NULL ORDER BY t.created_at DESC LIMIT 300`,
    email,
  );
  // The strongest thing that has happened, and when. Lit (lime) from delivery on, like the receipt; only a track unheard for
  // 90 days stays dim.
  const status = (r: (typeof rows)[number]): [string, boolean, number] =>
    r.played_out_at ? ["Played out", true, r.played_out_at] : r.replied_at ? ["Replied", true, r.replied_at] : r.downloaded_at ? ["Downloaded", true, r.downloaded_at] : r.played_at ? ["Listened", true, r.played_at] : unheardAfterWindow(r) ? [`Not listened to in ${RETAIN_UNREVIEWED_DAYS} days`, false, r.created_at] : ["Delivered", true, r.created_at];
  const heard = rows.filter((r) => r.played_at).length;

  return (
    // Light or dark with the visitor's device, one ~600px column of cards (owner, 30 Oct).
    <main className="theme-system mx-auto flex min-h-dvh max-w-[600px] flex-col gap-3 bg-ink px-3.5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-bone sm:px-6 sm:pt-10">
      <Logo className="mb-3" />
      <section aria-labelledby="history-h" className={`${CARD} flex flex-col p-3`}>
        <p className="flex items-center gap-1.5 text-[11.5px] text-mute">
          <Icon name="lock" className="size-[15px]" />
          <span className="min-w-0 truncate">Private · {email}</span>
        </p>
        <h1 id="history-h" className="mt-2 text-[24px] font-semibold leading-tight tracking-[-0.03em] sm:text-[28px]">Everything you&apos;ve sent</h1>
        <p className="mt-1 text-[12.5px] text-mute tnum">
          {rows.length} track{rows.length === 1 ? "" : "s"} sent · {heard} listened to
        </p>
        <ul className="mt-2.5 flex flex-col">
          {rows.map((r) => {
            const [label, good, at] = status(r);
            return (
              <li key={r.token} className="border-t border-line first:border-t-0">
                <Link href={`/receipt/${r.token}`} className="-mx-2 flex min-h-14 items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-well">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{r.title}</span>
                    <span className="block text-[11.5px] leading-[1.4] text-mute">
                      {r.artist} · to {r.receiver} · sent {fmtDay(r.created_at)}
                    </span>
                  </span>
                  <span className={`flex shrink-0 items-center gap-1.5 text-right text-[11.5px] ${good ? "font-semibold text-bone" : "text-dim"}`}>
                    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${good ? "bg-(--color-lime)" : "border border-line-2"}`} />
                    <span className="max-w-[9.5rem] sm:max-w-none">{label}</span>
                    {good && <span className="hidden font-normal text-dim sm:inline">{ago(at)}</span>}
                  </span>
                  <Icon name="chev" className="size-[15px] shrink-0 text-dim" />
                </Link>
              </li>
            );
          })}
          {!rows.length && <li className="py-6 text-[13px] text-mute">Nothing sent yet. Send a track through a receiver&apos;s link and it will show here.</li>}
        </ul>
      </section>
      <form action={endLink} className={`${CARD} flex flex-col gap-2 p-3`}>
        <button className="inline-flex min-h-11 w-fit items-center rounded-[11px] border border-line bg-well px-3.5 text-[12.5px] font-semibold text-bone hover:bg-ink-4">End this link now</button>
        <p className="text-[11.5px] text-dim">It stops working straight away. You can always email yourself a new one.</p>
      </form>
    </main>
  );
}
