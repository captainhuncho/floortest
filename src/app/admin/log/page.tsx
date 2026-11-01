import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { likeContains, q } from "@/lib/db";
import { LevelPill, LogTime, PageHead, type Tone } from "../PinParts";

export const metadata = { title: "Admin log — FloorTest admin" };

const PAGE = 100;
type Row = { id: number; action: string; target: string; detail: string; created_at: number; admin_id: number | null; admin: string | null };

/** Pin 96's level column, worked out from the action's wording: what was taken away, who looked at what, what changed. */
const LEVELS: [RegExp, string, Tone][] = [
  [/delet|remov|suspend|revok|reject|blocked|erase|denied|discard|declin|fail|unprotect|reset two/, "Remove", "danger"],
  [/sign|played|viewed|download|export/, "Access", "violet"],
  [/chang|edit|switch|plan|publish|set |saved|restor|tag|protect|note|status|seats/, "Change", "amber"],
];
const level = (action: string): [string, Tone] => {
  const hit = LEVELS.find(([re]) => re.test(action));
  return hit ? [hit[1], hit[2]] : ["Action", "lime"];
};

/**
 * Every change made from the admin area, laid out like pin 96's log (owner, 1 Nov): a search bar over a table with
 * a mono time column, a level label and what happened. Filter by admin or action, and jump to the account.
 */
export default async function AdminLog({ searchParams }: { searchParams: Promise<{ admin?: string; action?: string; q?: string; before?: string }> }) {
  await requireAdmin("super");
  const sp = await searchParams;
  const adminId = Number(sp.admin) || null;
  const action = (sp.action ?? "").slice(0, 80) || null;
  const search = (sp.q ?? "").trim().slice(0, 100);
  const before = Number(sp.before) || null;

  const where: string[] = [];
  const args: (string | number)[] = [];
  if (adminId) {
    where.push("l.admin_id = ?");
    args.push(adminId);
  }
  if (action) {
    where.push("l.action = ?");
    args.push(action);
  }
  if (search) {
    where.push("(l.target ILIKE ? OR l.detail ILIKE ? OR l.action ILIKE ?)");
    args.push(...Array(3).fill(likeContains(search)));
  }
  if (before) {
    where.push("l.id < ?");
    args.push(before);
  }
  const rows = await q.all<Row>(
    `SELECT l.id, l.action, l.target, l.detail, l.created_at, l.admin_id, u.email AS admin FROM admin_log l LEFT JOIN users u ON u.id = l.admin_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY l.id DESC LIMIT ${PAGE + 1}`,
    ...args,
  );
  const more = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);
  const [admins, actions] = await Promise.all([
    q.all<{ id: number; email: string }>("SELECT DISTINCT u.id, u.email FROM admin_log l JOIN users u ON u.id = l.admin_id ORDER BY u.email"),
    q.all<{ action: string; n: number }>("SELECT action, COUNT(*)::int AS n FROM admin_log GROUP BY action ORDER BY action"),
  ]);

  // Targets that name an account (@handle or an email) link to it.
  const handles = [...new Set(shown.map((r) => r.target.match(/^@([a-z0-9_-]+)/)?.[1]).filter((h): h is string => !!h))];
  const emails = [...new Set(shown.map((r) => r.target.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)?.[0]?.toLowerCase()).filter((e): e is string => !!e))];
  const byHandle = new Map(
    (handles.length ? await q.all<{ id: number; handle: string }>(`SELECT id, handle FROM users WHERE handle IN (${handles.map(() => "?").join(",")})`, ...handles) : []).map((u) => [u.handle, u.id]),
  );
  const byEmail = new Map(
    (emails.length ? await q.all<{ id: number; email: string }>(`SELECT id, lower(email) AS email FROM users WHERE lower(email) IN (${emails.map(() => "?").join(",")})`, ...emails) : []).map((u) => [u.email, u.id]),
  );
  const accountFor = (target: string) => byHandle.get(target.match(/^@([a-z0-9_-]+)/)?.[1] ?? "") ?? byEmail.get(target.toLowerCase());
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ admin: adminId ? String(adminId) : null, action, q: search || null, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/log${s ? `?${s}` : ""}`;
  };
  const filtered = !!(search || action || adminId);

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Platform" title="Admin log">
        Every change made from the admin area, newest first. Kept for the record; entries can&apos;t be edited or deleted.
      </PageHead>

      <section aria-label="Log" className="admin-panel admin-rise p-4 sm:p-5" style={{ "--i": 1 } as React.CSSProperties}>
        {/* Pin 96: the search bar across the top, the filters beside it. */}
        <form action="/admin/log" role="search" className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-64">
            <span className="sr-only">Search the log</span>
            <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input name="q" defaultValue={search} placeholder="Search logs: @handle, email, #id…" className="input min-h-11 w-full rounded-full pl-10" />
          </label>
          <label className="min-w-0 basis-48">
            <span className="sr-only">Action</span>
            <select name="action" defaultValue={action ?? ""} className="input min-h-11 w-full rounded-full">
              <option value="">Every action</option>
              {actions.map((a) => (
                <option key={a.action} value={a.action}>
                  {a.action} ({a.n})
                </option>
              ))}
            </select>
          </label>
          {admins.length > 1 && (
            <label className="min-w-0 basis-48">
              <span className="sr-only">Admin</span>
              <select name="admin" defaultValue={adminId ? String(adminId) : ""} className="input min-h-11 w-full rounded-full">
                <option value="">Every admin</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="admin-press inline-flex min-h-11 items-center rounded-full bg-bone px-5 text-[13.5px] font-semibold text-ink">Filter</button>
          {filtered && (
            <Link href="/admin/log" className="inline-flex min-h-11 items-center px-2 text-[13px] text-mute hover:text-bone">
              Clear
            </Link>
          )}
        </form>

        <div className="mt-4 overflow-hidden rounded-[16px] ring-1 ring-line">
          <div aria-hidden className="hidden grid-cols-[190px_120px_minmax(0,1fr)_minmax(0,220px)] gap-4 bg-ink-3 px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint md:grid">
            <span>Time</span>
            <span>Level</span>
            <span>What happened</span>
            <span>By</span>
          </div>
          <ul>
            {shown.map((r, i) => {
              const acct = accountFor(r.target);
              const [word, tone] = level(r.action);
              return (
                <li
                  key={r.id}
                  className="admin-rise grid gap-x-4 gap-y-2 border-t border-line px-4 py-3.5 first:border-t-0 md:grid-cols-[190px_120px_minmax(0,1fr)_minmax(0,220px)] md:items-center md:first:border-t"
                  style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
                >
                  <LogTime at={r.created_at} id={r.id} />
                  <span>
                    <LevelPill tone={tone}>{word}</LevelPill>
                  </span>
                  <p className="min-w-0 break-words text-[14px]">
                    <Link href={href({ action: r.action, before: null })} className="font-semibold hover:underline">
                      {r.action.charAt(0).toUpperCase() + r.action.slice(1)}
                    </Link>{" "}
                    {acct ? (
                      <Link href={`/admin/accounts/${acct}`} className="text-bone underline underline-offset-4">
                        {r.target}
                      </Link>
                    ) : (
                      <span className="text-bone">{r.target}</span>
                    )}
                    {r.detail && <span className="block truncate text-[12.5px] text-mute">{r.detail}</span>}
                  </p>
                  <span className="truncate text-[12.5px] text-mute">{r.admin ?? "deleted admin"}</span>
                </li>
              );
            })}
            {!shown.length && <li className="px-4 py-8 text-center text-[14px] text-mute">{filtered ? "Nothing matches." : "No admin actions yet."}</li>}
          </ul>
        </div>
        {more && (
          <Link href={href({ before: String(shown[shown.length - 1].id) })} className="admin-press mt-4 inline-flex min-h-11 items-center rounded-full px-5 text-[13.5px] font-semibold ring-1 ring-line-2 hover:bg-ink-3">
            Older entries
          </Link>
        )}
      </section>
    </div>
  );
}
