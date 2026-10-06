import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { APP_URL } from "@/lib/mail";
import { SendComposer } from "./SendComposer";

export const metadata = { title: "Send — FloorTest" };

/** Send your own music to another user's link, and see what happened to everything you've sent. */
export default async function Send({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const user = await requireUser();
  await trackUse(user.id, "send");
  const to = ((await searchParams).to || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop()!.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30);
  const sent = await q.all<{
    token: string; title: string; artist: string; created_at: number; played_at: number | null; downloaded_at: number | null;
    replied_at: number | null; played_out_at: number | null; deleted_at: number | null; receiver: string; handle: string;
  }>(
    `SELECT t.token, t.title, t.artist, t.created_at, t.played_at, t.downloaded_at, t.replied_at, t.played_out_at, t.deleted_at, u.name AS receiver, u.handle
     FROM tracks t JOIN senders s ON s.id = t.sender_id JOIN users u ON u.id = t.user_id
     WHERE s.account_id = ? OR (? AND lower(s.email) = ?)
     ORDER BY t.created_at DESC LIMIT 200`,
    user.id,
    // Tracks sent from the public link by email only count once this account has proved it owns that email.
    !!user.email_verified_at,
    user.email.toLowerCase(),
  );
  const status = (r: (typeof sent)[number]) =>
    r.played_out_at ? ["Played out", true] : r.replied_at ? ["Replied", true] : r.downloaded_at ? ["Downloaded", true] : r.played_at ? ["Listened", true] : r.deleted_at ? ["Removed", false] : ["Delivered", false];

  return (
    <div className="max-w-3xl px-4 py-6 sm:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Send</h1>
      <p className="mt-2 text-mute">Send your music to another FloorTest user. Add the name at the end of their link.</p>
      <div className="mt-8">
        <SendComposer host={APP_URL.replace(/^https?:\/\//, "")} account={{ name: user.name, email: user.email }} initial={to} />
      </div>

      <section aria-labelledby="sent-h" className="mt-12">
        <h2 id="sent-h" className="label">
          Sent ({sent.length})
        </h2>
        <ul className="mt-3 divide-y divide-line rounded-md border border-line">
          {sent.map((r) => {
            const [label, good] = status(r);
            return (
              <li key={r.token}>
                <Link href={`/receipt/${r.token}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-ink-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {r.artist} - {r.title}
                    </span>
                    <span className="block text-sm text-mute">
                      to {r.receiver} <span className="font-mono">/{r.handle}</span> · {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                  <span className={`chip shrink-0 ${good ? "border-lime/50 text-lime" : "border-line text-mute"}`}>{label}</span>
                </Link>
              </li>
            );
          })}
          {!sent.length && <li className="px-4 py-6 text-mute">Nothing sent yet.</li>}
        </ul>
      </section>
    </div>
  );
}
