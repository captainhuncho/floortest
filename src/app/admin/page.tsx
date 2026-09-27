import Link from "next/link";
import { configProblems, env } from "@/lib/env";
import { q } from "@/lib/db";
import { fmtBytes } from "@/lib/format";

const DAY = 86_400_000;

export default async function AdminOverview() {
  const t = Date.now();
  const c = (sql: string, ...a: (string | number)[]) => q.count(sql, ...a);
  const [users, users7, suspended, twofa, tracks, tracks7, live, senders, sent30, failed30] = await Promise.all([
    c("SELECT COUNT(*) AS n FROM users"),
    c("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", t - 7 * DAY),
    c("SELECT COUNT(*) AS n FROM users WHERE suspended_at IS NOT NULL"),
    c("SELECT COUNT(*) AS n FROM users WHERE totp_enabled_at IS NOT NULL"),
    c("SELECT COUNT(*) AS n FROM tracks"),
    c("SELECT COUNT(*) AS n FROM tracks WHERE created_at >= ?", t - 7 * DAY),
    c("SELECT COUNT(*) AS n FROM tracks WHERE deleted_at IS NULL"),
    c("SELECT COUNT(*) AS n FROM senders"),
    c("SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND created_at >= ?", t - 30 * DAY),
    c("SELECT COUNT(*) AS n FROM outbox WHERE status LIKE 'failed%' AND created_at >= ?", t - 30 * DAY),
  ]);
  const bytes = (await q.get<{ n: number | null }>("SELECT SUM(size) AS n FROM tracks WHERE deleted_at IS NULL AND file_key IS NOT NULL"))?.n ?? 0;
  const newest = await q.all<{ id: number; name: string; handle: string; created_at: number }>(
    "SELECT id, name, handle, created_at FROM users ORDER BY created_at DESC LIMIT 5",
  );
  const problems = configProblems();

  const stats = [
    ["Receivers", users, `+${users7} this week`],
    ["Tracks received", tracks, `+${tracks7} this week`],
    ["Tracks on file", live, fmtBytes(bytes)],
    ["Senders", senders, ""],
    ["Emails sent (30d)", sent30, failed30 ? `${failed30} failed` : "none failed"],
    ["Two-factor on", twofa, `${suspended} suspended`],
  ] as const;

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([k, v, sub]) => (
          <li key={k} className="card p-5">
            <p className="label">{k}</p>
            <p className="mt-2 text-3xl font-bold tnum">{v.toLocaleString("en")}</p>
            {sub && <p className={`mt-1 text-sm ${String(sub).includes("failed") && !String(sub).startsWith("none") ? "text-danger" : "text-mute"}`}>{sub}</p>}
          </li>
        ))}
      </ul>

      <section aria-labelledby="health-h">
        <h2 id="health-h" className="text-lg font-semibold">
          Configuration
        </h2>
        {problems.length ? (
          <ul className="mt-3 space-y-2">
            {problems.map((p) => (
              <li key={p} className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-lime">Everything required is set.</p>
        )}
        <p className="mt-3 text-sm text-mute">Sign-up mode: {env.signupMode}. Emails send from {env.email.from}.</p>
      </section>

      <section aria-labelledby="new-h">
        <h2 id="new-h" className="text-lg font-semibold">
          Newest receivers
        </h2>
        <ul className="mt-3 divide-y divide-line rounded-md border border-line">
          {newest.map((u) => (
            <li key={u.id}>
              <Link href={`/admin/accounts/${u.id}`} className="flex justify-between px-4 py-3 hover:bg-ink-2">
                <span>
                  {u.name} <span className="text-mute">@{u.handle}</span>
                </span>
                <span className="text-sm text-mute">{new Date(u.created_at).toLocaleDateString("en-GB")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
