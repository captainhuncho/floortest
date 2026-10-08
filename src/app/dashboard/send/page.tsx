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
  type Sent = (typeof sent)[number];
  // What a sender is allowed to see, in order. The receiver's keep/pass decision is private and never shown.
  const steps = (r: Sent) => [
    { label: "Delivered", at: r.created_at },
    { label: "Listened", at: r.played_at },
    { label: "Downloaded", at: r.downloaded_at },
    { label: "Replied", at: r.replied_at },
  ];
  const t = Date.now();
  const ago = (ms: number) => {
    const m = Math.max(1, Math.floor((t - ms) / 60_000));
    return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
  };
  // The most recent thing that happened, in words.
  const latest = (r: Sent) => {
    if (r.deleted_at) return `Removed ${ago(r.deleted_at)}`;
    const ev = ([["Played out", r.played_out_at], ["Replied", r.replied_at], ["Downloaded", r.downloaded_at], ["Listened", r.played_at]] as const).filter(([, at]) => at).sort((x, y) => Number(y[1]) - Number(x[1]))[0];
    return ev ? `${ev[0]} ${ago(Number(ev[1]))}` : `Delivered ${ago(r.created_at)} · not played yet`;
  };

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
        <p className="mt-1 text-sm text-mute">Tap a send to follow it: when it&apos;s delivered, listened to, downloaded and replied to.</p>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-md border border-line">
          {sent.map((r) => (
            <li key={r.token}>
              <Link
                href={`/receipt/${r.token}`}
                className="group block px-4 py-3.5 hover:bg-ink-2 focus-visible:bg-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lime active:bg-ink-2"
              >
                <span className="flex items-start justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {r.artist} - {r.title}
                    </span>
                    <span className="block text-sm text-mute">
                      to {r.receiver} <span className="font-mono">/{r.handle}</span> · {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-lime">
                    Track <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </span>
                {r.deleted_at ? (
                  <span className="mt-2 inline-block rounded-full border border-line px-2 py-0.5 text-[11px] text-mute">Removed by the receiver</span>
                ) : (
                  <span className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1" aria-label="Progress">
                    {steps(r).map((st, i) => (
                      <span key={st.label} className="flex items-center gap-1.5">
                        {i > 0 && <span aria-hidden className={`hidden h-px w-3 sm:block ${st.at ? "bg-lime/60" : "bg-line"}`} />}
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${st.at ? "border-lime/50 text-lime" : "border-line text-faint"}`}>
                          {st.at ? "✓ " : ""}
                          {st.label}
                          <span className="sr-only">{st.at ? " (done)" : " (not yet)"}</span>
                        </span>
                      </span>
                    ))}
                    {r.played_out_at && <span className="rounded-full bg-lime px-2 py-0.5 text-[11px] font-semibold text-ink">Played out</span>}
                  </span>
                )}
                <span className="mt-1.5 block text-xs text-mute">{latest(r)}</span>
              </Link>
            </li>
          ))}
          {!sent.length && (
            <li className="px-4 py-6 text-sm text-mute">
              Nothing sent yet. Once you send a track it shows up here, and you can tap it to follow it: delivered, listened to, downloaded and the receiver&apos;s
              reply.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
