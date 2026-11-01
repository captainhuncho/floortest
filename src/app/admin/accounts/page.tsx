import { can, requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { ACTIVITY, JOINED, audienceWhere, readAudience } from "@/lib/audience";
import { PAGE_SIZE, readPage, readSecurity, SECURITY, securityWhere } from "@/lib/admin-bulk";
import { AccountsTable } from "./AccountsTable";
import { allPlans } from "@/lib/plan-store";
import { AudienceFields } from "../AudienceFields";
import { KIND_LABEL, now } from "@/lib/db";
import { likeContains, q } from "@/lib/db";

/** Users: receivers (accounts with a link) and senders (people who've sent tracks, identified by email). */
export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requireAdmin("users.read");
  const sp = await searchParams;
  const search = (sp.q || "").trim().slice(0, 100);
  if (sp.view === "senders") return <Senders search={search} />;
  const aud = readAudience((k) => sp[k]);
  const security = readSecurity(sp.security);
  const page = readPage(sp.page);
  const w = audienceWhere(aud, now(), true);
  const plans = await allPlans();
  const params = { ...aud, joined: aud.joined ? String(aud.joined) : "", security, q: search };
  const link = (change: Partial<Record<keyof typeof params | "page", string>>) => {
    const qs = new URLSearchParams(Object.entries({ ...params, ...change }).filter(([, v]) => v) as [string, string][]).toString();
    return `/admin/accounts${qs ? `?${qs}` : ""}`;
  };
  const csv = new URLSearchParams(Object.entries({ ...aud, joined: params.joined, q: search }).filter(([, v]) => v) as [string, string][]).toString();
  const where = `${w.sql} AND ${securityWhere(security)} ${search ? "AND (u.name ILIKE ? OR u.email ILIKE ? OR u.handle ILIKE ?)" : ""}`;
  const args = [...w.args, ...(search ? Array(3).fill(likeContains(search)) : [])];
  const [total, rows] = await Promise.all([
    q.count(`SELECT COUNT(*) AS n FROM users u WHERE ${where}`, ...args),
    q.all<{
      id: number; name: string; handle: string; email: string; plan: string; created_at: number;
      suspended_at: number | null; totp_enabled_at: number | null; email_verified_at: number | null; live: number; kind: string | null; admin_tags: string;
    }>(
      `SELECT u.id, u.name, u.handle, u.email, u.plan, u.kind, u.admin_tags, u.created_at, u.suspended_at, u.totp_enabled_at, u.email_verified_at,
         (SELECT COUNT(*) FROM tracks t WHERE t.user_id = u.id AND t.deleted_at IS NULL) AS live
       FROM users u WHERE ${where}
       ORDER BY u.created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      ...args,
    ),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  // Each filter that's on, as a chip that takes it off.
  const chips = [
    aud.kind && { label: "Type", value: KIND_LABEL[aud.kind], off: link({ kind: "", page: "" }) },
    aud.plan && { label: "Plan", value: planName(aud.plan), off: link({ plan: "", page: "" }) },
    aud.tag && { label: "Tag", value: aud.tag, off: link({ tag: "", page: "" }) },
    aud.joined && { label: "Joined", value: JOINED[aud.joined], off: link({ joined: "", page: "" }) },
    aud.activity && { label: "Activity", value: ACTIVITY[aud.activity], off: link({ activity: "", page: "" }) },
    security && { label: "Security", value: SECURITY[security], off: link({ security: "", page: "" }) },
  ].filter(Boolean) as { label: string; value: string; off: string }[];
  const first = (page - 1) * PAGE_SIZE + 1;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="mt-1 text-mute">Everyone with a link, and everyone who has sent them a track.</p>
        </div>
        <a href={`/api/admin/users-csv${csv ? `?${csv}` : ""}`} className="btn-ghost btn-sm">
          Export CSV
        </a>
      </div>
      <Tabs active="receivers" />
      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <form className="flex min-w-0 basis-full gap-2 sm:max-w-sm sm:flex-1 sm:basis-auto" role="search">
          {Object.entries(params).map(([k, v]) => k !== "q" && v && <input key={k} type="hidden" name={k} value={v} />)}
          <input name="q" defaultValue={search} placeholder="Name, email or link" className="input min-w-0 flex-1" aria-label="Search receivers" />
          <button className="btn-ghost btn-sm">Search</button>
        </form>
        <details>
          <summary className="btn-ghost btn-sm flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            Filters
            {chips.length > 0 && <span className="rounded bg-lime px-1.5 text-[11px] font-bold text-ink tnum">{chips.length}</span>}
          </summary>
          <form className="fixed inset-x-4 top-28 z-40 max-h-[70dvh] space-y-3 overflow-y-auto rounded-[14px] border border-line-2 bg-ink-3 p-4 shadow-2xl sm:absolute sm:inset-x-0 sm:top-full sm:mt-2">
            {search && <input type="hidden" name="q" value={search} />}
            <AudienceFields a={aud} plans={plans} />
            <label className="block max-w-xs space-y-1.5">
              <span className="label">Security</span>
              <select name="security" defaultValue={security} className="input">
                {Object.entries(SECURITY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <Link href="/admin/accounts" className="btn-ghost btn-sm">
                Clear all
              </Link>
              <button className="btn-lime btn-sm">Show results</button>
            </div>
          </form>
        </details>
        {chips.map((c) => (
          <Link key={c.label} href={c.off} className="chip min-h-8 gap-1.5 border-line-2 text-bone hover:border-field" aria-label={`Remove filter ${c.label}: ${c.value}`}>
            <span className="text-faint">{c.label}</span> {c.value} <span aria-hidden>✕</span>
          </Link>
        ))}
        {chips.length > 1 && (
          <Link href={link({ kind: "", plan: "", tag: "", joined: "", activity: "", security: "", page: "" })} className="text-sm text-mute hover:text-bone">
            Clear all
          </Link>
        )}
        <span className="ml-auto text-sm text-faint tnum">
          {total.toLocaleString("en-GB")} {total === 1 ? "account" : "accounts"}
        </span>
      </div>
      <div className="mt-4">
        <AccountsTable
          canAct={can(admin.access, "users.support")}
          rows={rows.map((u) => ({
            id: u.id,
            name: u.name,
            handle: u.handle,
            email: u.email,
            plan: u.plan,
            kind: KIND_LABEL[u.kind ?? ""] ?? "—",
            live: Number(u.live),
            joined: new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
            suspended: !!u.suspended_at,
            confirmed: !!u.email_verified_at,
            twoFactor: !!u.totp_enabled_at,
            tags: u.admin_tags ? u.admin_tags.split(",") : [],
          }))}
        />
      </div>
      {total > 0 && (
        <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-faint">
          <span className="tnum">
            {first.toLocaleString("en-GB")}–{Math.min(total, page * PAGE_SIZE).toLocaleString("en-GB")} of {total.toLocaleString("en-GB")}
          </span>
          {pages > 1 && (
            <span className="ml-auto flex gap-1">
              {page > 1 && (
                <Link href={link({ page: String(page - 1) })} className="btn-ghost btn-sm" aria-label="Previous page">
                  ‹
                </Link>
              )}
              {pageList(page, pages).map((p, i) =>
                p === 0 ? (
                  <span key={`gap${i}`} className="grid min-w-9 place-items-center">
                    …
                  </span>
                ) : (
                  <Link
                    key={p}
                    href={link({ page: String(p) })}
                    aria-current={p === page ? "page" : undefined}
                    className={`btn-sm grid min-w-9 place-items-center rounded-md border tnum ${p === page ? "border-line-2 bg-ink-4 text-bone" : "border-line text-mute hover:text-bone"}`}
                  >
                    {p}
                  </Link>
                ),
              )}
              {page < pages && (
                <Link href={link({ page: String(page + 1) })} className="btn-ghost btn-sm" aria-label="Next page">
                  ›
                </Link>
              )}
            </span>
          )}
        </nav>
      )}
    </div>
  );
}

/** 1 … 4 5 6 … 20: the first, last and nearby pages; 0 marks a gap. */
function pageList(page: number, pages: number) {
  const keep = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return keep.flatMap((p, i) => (i && p - keep[i - 1] > 1 ? [0, p] : [p]));
}

function Tabs({ active }: { active: "receivers" | "senders" }) {
  return (
    <nav className="mt-5 inline-flex rounded-[11px] border border-line bg-ink-2 p-[3px]" aria-label="User type">
      {[
        ["receivers", "Receivers", "/admin/accounts"],
        ["senders", "Senders", "/admin/accounts?view=senders"],
      ].map(([k, label, href]) => (
        <Link
          key={k}
          href={href}
          aria-current={active === k ? "page" : undefined}
          className={`grid min-h-9 place-items-center rounded-lg px-4 text-sm font-semibold ${active === k ? "bg-ink-4 text-bone" : "text-mute hover:text-bone"}`}
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
          <input type="hidden" name="view" value="senders" />
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
