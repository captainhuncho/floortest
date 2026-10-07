import Link from "next/link";
import { ConfirmButton } from "../AdminUi";
import { q } from "@/lib/db";
import { inviteFromWaitlist, removeFromWaitlist } from "../actions";

/** People who asked for an invite from the home page. */
const PAGE = 200;

export default async function Waitlist({ searchParams }: { searchParams: Promise<{ show?: string; n?: string }> }) {
  const sp = await searchParams;
  const showAll = sp.show === "all";
  // Oldest first, a page at a time: "Show more" grows the list instead of silently stopping at a cap.
  const limit = Math.min(5000, Math.max(PAGE, Math.round(Number(sp.n) || PAGE)));
  const [rows, waiting, total, sources] = await Promise.all([
    q.all<{ id: number; email: string; name: string; role: string; link: string; handle: string; source: string; invited_at: number | null; created_at: number; joined: string | null }>(
    `SELECT w.*, (SELECT u.handle FROM users u WHERE u.email = w.email) AS joined FROM waitlist w
     ${showAll ? "" : "WHERE w.invited_at IS NULL"} ORDER BY w.created_at ASC LIMIT ${limit}`,
    ),
    q.count("SELECT COUNT(*) AS n FROM waitlist WHERE invited_at IS NULL"),
    q.count(`SELECT COUNT(*) AS n FROM waitlist ${showAll ? "" : "WHERE invited_at IS NULL"}`),
    q.all<{ source: string; n: number }>("SELECT source, COUNT(*)::int AS n FROM waitlist WHERE source <> '' GROUP BY source ORDER BY n DESC LIMIT 3"),
  ]);
  const more = Number(total) > rows.length;
  const safeLink = (l: string) => (/^https?:\/\//i.test(l) ? l : l ? `https://${l.replace(/^@/, "instagram.com/")}` : "");
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Waitlist</h1>
          <p className="mt-2 text-mute">{waiting} waiting · oldest first{sources.length ? ` · top sources: ${sources.map((s) => `${s.source} (${s.n})`).join(", ")}` : ""}. Invite sends a personal, single-use invite by email.</p>
        </div>
        <Link href={showAll ? "/admin/waitlist" : "/admin/waitlist?show=all"} className="btn-ghost btn-sm">
          {showAll ? "Waiting only" : "Show invited too"}
        </Link>
      </div>
      <div className="mt-6 overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-mute">
            <tr>{["Who", "Does", "Link", "Asked", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((w) => (
              <tr key={w.id} className={w.invited_at ? "text-mute" : ""}>
                <td className="px-4 py-3">
                  {w.name && <span className="font-medium">{w.name} </span>}
                  <span className="text-mute">{w.email}</span>
                  {w.source && <span className="block text-xs text-faint">from {w.source}</span>}
                </td>
                <td className="px-4 py-3">
                  {w.role}
                  {w.handle && <span className="block text-xs text-lime">/{w.handle}</span>}
                </td>
                <td className="max-w-48 truncate px-4 py-3">
                  {w.link && (
                    <a href={safeLink(w.link)} target="_blank" rel="noreferrer noopener" className="text-mute underline-offset-4 hover:text-bone hover:underline">
                      {w.link}
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-mute">{new Date(w.created_at).toLocaleDateString("en-GB")}</td>
                <td className="space-x-3 whitespace-nowrap px-4 py-3 text-right">
                  {w.joined ? (
                    <span className="chip border-lime/50 text-lime">Joined @{w.joined}</span>
                  ) : w.invited_at ? (
                    <span className="chip border-line">Invited</span>
                  ) : (
                    <>
                      <form action={inviteFromWaitlist.bind(null, w.id)} className="inline">
                        <button className="btn-lime btn-sm">Invite</button>
                      </form>
                      <ConfirmButton action={removeFromWaitlist.bind(null, w.id)} message={`Remove ${w.email} from the waitlist?`} className="text-sm text-mute hover:text-danger">
                        Remove
                      </ConfirmButton>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-mute">{showAll ? "Nobody has asked yet." : "Nobody waiting."}</p>}
      </div>
      {more && (
        <p className="mt-4 flex items-center gap-3 text-sm text-mute">
          Showing {rows.length} of {Number(total)}.
          <Link href={`/admin/waitlist?${showAll ? "show=all&" : ""}n=${limit + PAGE}`} className="btn-ghost btn-sm">
            Show {Math.min(PAGE, Number(total) - rows.length)} more
          </Link>
        </p>
      )}
    </div>
  );
}
