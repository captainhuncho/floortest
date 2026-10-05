import Link from "next/link";
import { likeContains, q } from "@/lib/db";

/** Users: receivers (accounts with a link) and senders (people who've sent tracks, identified by email). */
export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const sp = await searchParams;
  const search = (sp.q || "").trim().slice(0, 100);
  if (sp.kind === "senders") return <Senders search={search} />;
  const labels = sp.kind === "labels";
  const rows = await q.all<{
    id: number; name: string; handle: string; email: string; plan: string; created_at: number;
    suspended_at: number | null; totp_enabled_at: number | null; email_verified_at: number | null; live: number; kind: string | null;
  }>(
    `SELECT u.id, u.name, u.handle, u.email, u.plan, u.kind, u.created_at, u.suspended_at, u.totp_enabled_at, u.email_verified_at,
       (SELECT COUNT(*) FROM tracks t WHERE t.user_id = u.id AND t.deleted_at IS NULL) AS live
     FROM users u WHERE ${labels ? "u.kind = 'label'" : "TRUE"} ${search ? "AND (u.name ILIKE ? OR u.email ILIKE ? OR u.handle ILIKE ?)" : ""}
     ORDER BY u.created_at DESC LIMIT 200`,
    ...(search ? Array(3).fill(likeContains(search)) : []),
  );
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={search} placeholder="Name, email or link" className="input w-64" aria-label="Search receivers" />
          <button className="btn-ghost btn-sm">Search</button>
        </form>
      </div>
      <Tabs active={labels ? "labels" : "receivers"} />
      <div className="mt-4 overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-mute">
            <tr>
              {["Receiver", "Type", "Email", "Plan", "Tracks", "Security", "Joined"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-ink-2">
                <td className="px-4 py-3">
                  <Link href={`/admin/accounts/${u.id}`} className="font-medium hover:underline">{u.name}</Link>
                  <span className="text-mute"> @{u.handle}</span>
                  {u.suspended_at && <span className="chip ml-2 border-danger/50 text-danger">Suspended</span>}
                </td>
                <td className="px-4 py-3 text-mute">{u.kind === "label" ? "Label" : u.kind === "dj" ? "DJ" : "—"}</td>
                <td className="px-4 py-3 text-mute">{u.email}{!u.email_verified_at && <span className="ml-1 text-danger">(unconfirmed)</span>}</td>
                <td className="px-4 py-3 capitalize">{u.plan}</td>
                <td className="px-4 py-3 tnum">{u.live}</td>
                <td className="px-4 py-3 text-mute">{u.totp_enabled_at ? "2FA on" : "Password only"}</td>
                <td className="px-4 py-3 text-mute">{new Date(u.created_at).toLocaleDateString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-mute">No accounts match.</p>}
      </div>
    </div>
  );
}

function Tabs({ active }: { active: "receivers" | "labels" | "senders" }) {
  return (
    <nav className="mt-6 flex gap-1 border-b border-line" aria-label="User type">
      {[
        ["receivers", "Receivers", "/admin/accounts"],
        ["labels", "Labels", "/admin/accounts?kind=labels"],
        ["senders", "Senders", "/admin/accounts?kind=senders"],
      ].map(([k, label, href]) => (
        <Link
          key={k}
          href={href}
          aria-current={active === k ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${active === k ? "border-lime" : "border-transparent text-mute hover:text-bone"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** One row per sender email across every receiver. Senders have no account: this is who they are to us. */
async function Senders({ search }: { search: string }) {
  const rows = await q.all<{ email: string; name: string; receivers: number; tracks: number; listened: number; verified: number; blocked: number; last: number }>(
    `SELECT lower(s.email) AS email, MAX(s.name) AS name, COUNT(DISTINCT s.user_id) AS receivers, COUNT(t.id) AS tracks,
       COUNT(t.played_at) AS listened, COUNT(s.verified_at) AS verified, COUNT(s.blocked_at) AS blocked, MAX(t.created_at) AS last
     FROM senders s LEFT JOIN tracks t ON t.sender_id = s.id
     ${search ? "WHERE s.email ILIKE ? OR s.name ILIKE ?" : ""}
     GROUP BY lower(s.email) ORDER BY MAX(t.created_at) DESC NULLS LAST LIMIT 300`,
    ...(search ? [likeContains(search), likeContains(search)] : []),
  );
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <form className="flex gap-2">
          <input type="hidden" name="kind" value="senders" />
          <input name="q" defaultValue={search} placeholder="Sender name or email" className="input w-64" aria-label="Search senders" />
          <button className="btn-ghost btn-sm">Search</button>
        </form>
      </div>
      <Tabs active="senders" />
      <div className="mt-4 overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-mute">
            <tr>
              {["Sender", "Sent to", "Tracks", "Listened", "Status", "Last sent"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.email} className="hover:bg-ink-2">
                <td className="px-4 py-3">
                  <Link href={`/admin/moderation?q=${encodeURIComponent(r.email)}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>{" "}
                  <span className="text-mute">{r.email}</span>
                </td>
                <td className="px-4 py-3 tnum">{r.receivers} receiver{r.receivers === 1 ? "" : "s"}</td>
                <td className="px-4 py-3 tnum">{r.tracks}</td>
                <td className="px-4 py-3 tnum">{r.listened}</td>
                <td className="px-4 py-3 text-mute">
                  {r.verified ? "Email confirmed" : "Unconfirmed"}
                  {r.blocked ? <span className="chip ml-2 border-danger/50 text-danger">Blocked by {r.blocked}</span> : null}
                </td>
                <td className="px-4 py-3 text-mute">{r.last ? new Date(r.last).toLocaleDateString("en-GB") : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-mute">No senders match.</p>}
      </div>
    </div>
  );
}
