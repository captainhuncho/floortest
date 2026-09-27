import Link from "next/link";
import { ConfirmButton } from "../../dashboard/ClientBits";
import { likeContains, q } from "@/lib/db";
import { fmtBytes } from "@/lib/format";
import { blockSenderAsAdmin, removeTrackAsAdmin } from "../actions";

/** Find any track or sender across every account, for abuse reports and takedowns. */
export default async function Moderation({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const search = ((await searchParams).q || "").trim().slice(0, 100);
  const like = likeContains(search);
  const tracks = search
    ? await q.all<{ id: number; title: string; artist: string; size: number; created_at: number; handle: string; user_id: number; sender_id: number; sender: string; email: string; blocked_at: number | null }>(
        `SELECT t.id, t.title, t.artist, t.size, t.created_at, u.handle, u.id AS user_id, s.id AS sender_id, s.name AS sender, s.email, s.blocked_at
         FROM tracks t JOIN users u ON u.id = t.user_id JOIN senders s ON s.id = t.sender_id
         WHERE t.deleted_at IS NULL AND (t.title ILIKE ? OR t.artist ILIKE ? OR s.email ILIKE ? OR s.name ILIKE ? OR t.token = ?)
         ORDER BY t.created_at DESC LIMIT 100`,
        like, like, like, like, search,
      )
    : [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Moderation</h1>
          <p className="mt-2 text-mute">Search every account by track, artist, sender name or email, or a receipt token.</p>
        </div>
        <form className="flex gap-2">
          <input name="q" defaultValue={search} className="input w-72" placeholder="Search tracks and senders" aria-label="Search" />
          <button className="btn-ghost btn-sm">Search</button>
        </form>
      </div>
      {search && (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-mute">
              <tr>{["Track", "Sender", "Receiver", "Received", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tracks.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3">{t.artist} – {t.title} <span className="text-mute">· {fmtBytes(t.size)}</span></td>
                  <td className="px-4 py-3">{t.sender} <span className="text-mute">{t.email}</span>{t.blocked_at && <span className="chip ml-2 border-line text-mute">Blocked</span>}</td>
                  <td className="px-4 py-3"><Link href={`/admin/accounts/${t.user_id}`} className="hover:underline">@{t.handle}</Link></td>
                  <td className="px-4 py-3 text-mute">{new Date(t.created_at).toLocaleDateString("en-GB")}</td>
                  <td className="space-x-3 whitespace-nowrap px-4 py-3 text-right">
                    {!t.blocked_at && (
                      <ConfirmButton action={blockSenderAsAdmin.bind(null, t.sender_id)} message={`Block ${t.email} from @${t.handle}'s link?`} className="text-sm text-mute hover:text-bone">
                        Block sender
                      </ConfirmButton>
                    )}
                    <ConfirmButton
                      action={removeTrackAsAdmin.bind(null, t.id, "")}
                      message={`Remove "${t.title}" from @${t.handle}'s desk and delete the file? This can't be undone.`}
                      className="text-sm text-danger hover:underline"
                    >
                      Remove
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tracks.length && <p className="p-6 text-mute">Nothing matches.</p>}
        </div>
      )}
    </div>
  );
}
