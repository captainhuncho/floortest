import Link from "next/link";
import { Logo } from "@/components/Logo";
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
      <main className="mx-auto max-w-md px-4 py-10 sm:py-16">
        <Logo className="mb-12" />
        <h1 className="text-3xl font-bold tracking-tight">This link has expired</h1>
        <p className="mt-3 text-mute">Links work for 24 hours, or until they&apos;re ended.</p>
        <Link href="/sent" className="btn-lime mt-8 inline-block">
          Email me a new link
        </Link>
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
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <Logo className="mb-12" />
      <p className="label">Private · {email}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Everything you&apos;ve sent</h1>
      <p className="mt-2 text-mute">
        {rows.length} track{rows.length === 1 ? "" : "s"} sent · {heard} listened to
      </p>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {rows.map((r) => {
          const [label, good, at] = status(r);
          return (
            <li key={r.token}>
              <Link href={`/receipt/${r.token}`} className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3.5 hover:bg-ink-2">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{r.title}</span>
                  <span className="block truncate text-[12px] text-mute">
                    {r.artist} · to {r.receiver} · sent {fmtDay(r.created_at)}
                  </span>
                </span>
                <span className={`flex shrink-0 items-center gap-2 text-[12px] ${good ? "font-semibold text-bone" : "text-dim"}`}>
                  <span aria-hidden className={`size-2 rounded-full ${good ? "bg-lime" : "border border-line-2"}`} />
                  {label}
                  {good && <span className="font-normal text-dim">{ago(at)}</span>}
                </span>
              </Link>
            </li>
          );
        })}
        {!rows.length && <li className="py-6 text-mute">Nothing sent yet. Send a track through a receiver&apos;s link and it will show here.</li>}
      </ul>
      <form action={endLink} className="mt-8">
        <button className="btn-ghost btn-sm">End this link now</button>
        <p className="mt-2 text-[12px] text-dim">It stops working straight away. You can always email yourself a new one.</p>
      </form>
    </main>
  );
}
