import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { ConfirmButton, ConfirmSubmit } from "../AdminUi";
import { OpsForm } from "../OpsForm";
import { q } from "@/lib/db";
import { httpsLink } from "@/lib/safe-links";
import { inviteFromWaitlist, inviteOldestFromWaitlist, removeFromWaitlist } from "../actions";
import { Avatar, PageHead, StatusPill } from "../PinParts";

const PAGE = 200;
const TABS = { waiting: "Waiting", invited: "Invited", all: "All" } as const;
type Tab = keyof typeof TABS;
const WHERE: Record<Tab, string> = { waiting: "WHERE invited_at IS NULL", invited: "WHERE invited_at IS NOT NULL", all: "" };
const COLS = "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_110px_100px_170px]";

/**
 * People who asked for an invite from the home page, laid out like pin 107 (owner, 1 Nov): a tab switch and the
 * "invite the oldest" control in the toolbar, then one table with an avatar, a status pill and the row's actions.
 */
export default async function Waitlist({ searchParams }: { searchParams: Promise<{ status?: string; n?: string }> }) {
  await requireAdmin("waitlist");
  const sp = await searchParams;
  const tab: Tab = sp.status === "invited" || sp.status === "all" ? sp.status : "waiting";
  // Oldest first, a page at a time: "Show more" grows the list instead of silently stopping at a cap.
  const limit = Math.min(5000, Math.max(PAGE, Math.round(Number(sp.n) || PAGE)));
  const [rows, counts, sources] = await Promise.all([
    q.all<{ id: number; email: string; name: string; role: string; link: string; handle: string; source: string; invited_at: number | null; created_at: number; joined: string | null }>(
      `SELECT w.*, (SELECT u.handle FROM users u WHERE u.email = w.email) AS joined FROM waitlist w
     ${WHERE[tab].replace("invited_at", "w.invited_at")} ORDER BY w.created_at ASC LIMIT ${limit}`,
    ),
    q.get<Record<Tab, number>>(`SELECT COUNT(*) FILTER (WHERE invited_at IS NULL) AS waiting, COUNT(*) FILTER (WHERE invited_at IS NOT NULL) AS invited, COUNT(*) AS "all" FROM waitlist`),
    q.all<{ source: string; n: number }>("SELECT source, COUNT(*)::int AS n FROM waitlist WHERE source <> '' GROUP BY source ORDER BY n DESC LIMIT 3"),
  ]);
  const count = (t: Tab) => Number(counts?.[t] ?? 0);
  const waiting = count("waiting");
  const total = count(tab);
  const more = total > rows.length;
  const href = (t: Tab, n?: number) => `/admin/waitlist?status=${t}${n ? `&n=${n}` : ""}`;
  // https only; "@name" is an Instagram handle. Anything else (javascript:, data:) gets no link (src/lib/safe-links.ts).
  const safeLink = (l: string) => httpsLink(l.replace(/^@/, "instagram.com/"));
  return (
    <div className="space-y-6">
      <PageHead eyebrow="Growth" title="Waitlist">
        {waiting} waiting · oldest first{sources.length ? ` · top sources: ${sources.map((s) => `${s.source} (${s.n})`).join(", ")}` : ""}. Invite sends a personal, single-use invite by email.
      </PageHead>

      <section aria-label="Waitlist" className="admin-panel admin-rise p-4 sm:p-5" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Filter the waitlist" className="inline-flex rounded-full bg-ink-3 p-1 ring-1 ring-line">
            {(Object.keys(TABS) as Tab[]).map((t) => (
              <Link
                key={t}
                href={href(t)}
                aria-current={t === tab ? "page" : undefined}
                className={`admin-press flex min-h-11 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold ${t === tab ? "bg-bone text-ink" : "text-mute hover:text-bone"}`}
              >
                {TABS[t]}
                <span className={`rounded-full px-1.5 text-[11px] tnum ${t === tab ? "bg-ink/10" : "bg-ink-4"}`}>{count(t)}</span>
              </Link>
            ))}
          </nav>
          {tab === "waiting" && waiting > 0 && (
            <OpsForm action={inviteOldestFromWaitlist} className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[13px] text-mute">
                Invite the oldest
                <input name="n" type="number" min={1} max={50} defaultValue={Math.min(10, waiting)} required className="input min-h-11 w-20 rounded-full text-center" />
              </label>
              <ConfirmSubmit message="Email personal invites to the oldest people on the waitlist?" className="admin-press inline-flex min-h-11 items-center gap-1.5 rounded-full bg-lime px-5 text-[13.5px] font-semibold text-ink">
                <span aria-hidden className="text-[16px] leading-none">+</span> Send invites
              </ConfirmSubmit>
            </OpsForm>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-[16px] ring-1 ring-line">
          <div aria-hidden className={`hidden gap-4 bg-ink-3 px-4 py-3 text-[12px] font-semibold text-faint md:grid ${COLS}`}>
            <span>Name</span>
            <span>Does</span>
            <span>Link</span>
            <span>Status</span>
            <span>Asked</span>
            <span className="text-right">Actions</span>
          </div>
          <ul>
            {rows.map((w, i) => {
              const link = w.link ? safeLink(w.link) : null;
              return (
                <li
                  key={w.id}
                  className={`admin-rise grid items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-3 first:border-t-0 md:first:border-t ${COLS}`}
                  style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={w.name || w.email} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{w.name || w.email.split("@")[0]}</span>
                      <span className="block truncate text-[12px] text-faint">
                        {w.email}
                        {w.source && ` · from ${w.source}`}
                      </span>
                    </span>
                  </span>
                  <span className="min-w-0 text-[13px]">
                    {w.role}
                    {w.handle && <span className="block truncate text-[12px] text-lime">/{w.handle}</span>}
                  </span>
                  <span className="min-w-0 truncate text-[13px]">
                    {w.link && !link && <span className="text-mute">{w.link}</span>}
                    {link && (
                      <a href={link} target="_blank" rel="noreferrer noopener" className="text-mute underline-offset-4 hover:text-bone hover:underline">
                        {w.link}
                      </a>
                    )}
                  </span>
                  <span>
                    {w.joined ? <StatusPill tone="lime">Joined</StatusPill> : w.invited_at ? <StatusPill tone="violet">Invited</StatusPill> : <StatusPill tone="amber">Waiting</StatusPill>}
                  </span>
                  <span className="whitespace-nowrap text-[13px] text-mute">{new Date(w.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  <span className="flex flex-wrap items-center gap-2 md:justify-end">
                    {w.joined ? (
                      <span className="text-[12.5px] text-lime">@{w.joined}</span>
                    ) : w.invited_at ? (
                      <span className="text-[12.5px] text-faint">Sent</span>
                    ) : (
                      <>
                        <ConfirmButton
                          action={removeFromWaitlist.bind(null, w.id)}
                          message={`Remove ${w.email} from the waitlist?`}
                          className="admin-press inline-flex min-h-11 items-center rounded-full px-3.5 text-[12.5px] font-semibold text-mute ring-1 ring-line-2 hover:text-danger"
                        >
                          Remove
                        </ConfirmButton>
                        <OpsForm action={inviteFromWaitlist.bind(null, w.id)}>
                          <button className="admin-press inline-flex min-h-11 items-center rounded-full bg-lime px-4 text-[12.5px] font-semibold text-ink">Invite</button>
                        </OpsForm>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
            {!rows.length && (
              <li className="px-4 py-8 text-center text-[14px] text-mute">{tab === "all" ? "Nobody has asked yet." : tab === "invited" ? "Nobody invited yet." : "Nobody waiting."}</li>
            )}
          </ul>
        </div>
        <p className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-mute">
          <span className="tnum">
            Showing {rows.length} of {total}
          </span>
          {more && (
            <Link href={href(tab, limit + PAGE)} className="admin-press inline-flex min-h-11 items-center rounded-full px-5 text-[13px] font-semibold text-bone ring-1 ring-line-2 hover:bg-ink-3">
              Show {Math.min(PAGE, total - rows.length)} more
            </Link>
          )}
        </p>
      </section>
    </div>
  );
}
