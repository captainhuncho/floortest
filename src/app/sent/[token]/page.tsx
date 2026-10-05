import Link from "next/link";
import { Logo } from "@/components/Logo";
import { q } from "@/lib/db";
import { readSenderLink } from "@/lib/senderLink";

export const metadata = { title: "Your sends — FloorTest", robots: { index: false } };

/** Every track a sender has sent, across receivers. Only the signals senders are promised; decisions stay private. */
export default async function SenderHistory({ params }: { params: Promise<{ token: string }> }) {
  const email = readSenderLink((await params).token);
  if (!email)
    return (
      <main className="mx-auto max-w-md px-4 py-10 sm:py-16">
        <Logo className="mb-12" />
        <h1 className="text-3xl font-bold tracking-tight">This link has expired</h1>
        <p className="mt-3 text-mute">Links work for 24 hours.</p>
        <Link href="/sent" className="btn-lime mt-8 inline-block">
          Email me a new link
        </Link>
      </main>
    );
  const rows = await q.all<{
    token: string; title: string; artist: string; created_at: number; played_at: number | null; downloaded_at: number | null;
    replied_at: number | null; played_out_at: number | null; deleted_at: number | null; receiver: string;
  }>(
    `SELECT t.token, t.title, t.artist, t.created_at, t.played_at, t.downloaded_at, t.replied_at, t.played_out_at, t.deleted_at, u.name AS receiver
     FROM tracks t JOIN senders s ON s.id = t.sender_id JOIN users u ON u.id = t.user_id
     WHERE lower(s.email) = ? AND u.suspended_at IS NULL ORDER BY t.created_at DESC LIMIT 300`,
    email,
  );
  const status = (r: (typeof rows)[number]) =>
    r.played_out_at ? ["Played out", true] : r.replied_at ? ["Replied", true] : r.downloaded_at ? ["Downloaded", true] : r.played_at ? ["Listened", true] : r.deleted_at ? ["Removed", false] : ["Delivered", false];
  const heard = rows.filter((r) => r.played_at).length;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <Logo className="mb-12" />
      <p className="label">Private · {email}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Everything you&apos;ve sent</h1>
      <p className="mt-2 text-mute">
        {rows.length} track{rows.length === 1 ? "" : "s"} sent · {heard} listened to
      </p>
      <ul className="mt-8 divide-y divide-line rounded-md border border-line">
        {rows.map((r) => {
          const [label, good] = status(r);
          return (
            <li key={r.token}>
              <Link href={`/receipt/${r.token}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-ink-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {r.artist} - {r.title}
                  </span>
                  <span className="block text-sm text-mute">
                    to {r.receiver} · {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                <span className={`chip shrink-0 ${good ? "border-lime/50 text-lime" : "border-line text-mute"}`}>{label}</span>
              </Link>
            </li>
          );
        })}
        {!rows.length && <li className="px-4 py-6 text-mute">No tracks yet.</li>}
      </ul>
    </main>
  );
}
