import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { configProblems, env } from "@/lib/env";
import { q } from "@/lib/db";
import { fmtBytes } from "@/lib/format";
import { ALLOWANCE_WARN, allowances } from "@/lib/allowance";
import { BACKUP_KEEP_DAYS, lastBackup } from "@/lib/backup";
import { lastRuns } from "@/lib/cron";

const DAY = 86_400_000;

/** What needs doing first, then how this week compares with last. */
export default async function AdminOverview() {
  const t = Date.now();
  const c = (sql: string, ...a: (string | number)[]) => q.count(sql, ...a);
  const week = (sql: string) => Promise.all([c(sql, t - 7 * DAY, t), c(sql, t - 14 * DAY, t - 7 * DAY)]);

  const [takedowns, appeals, privacy, inbox, verifying, waiting, failed, incidents] = await Promise.all([
    c("SELECT COUNT(*) AS n FROM takedowns WHERE status = 'open'"),
    c("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL AND topic = 'Suspension appeal'"),
    c("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL AND topic = 'Privacy request'"),
    c("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL AND topic NOT IN ('Suspension appeal', 'Privacy request')"),
    c("SELECT COUNT(*) AS n FROM users WHERE identity_status = 'pending'"),
    c("SELECT COUNT(*) AS n FROM waitlist WHERE invited_at IS NULL"),
    c("SELECT COUNT(*) AS n FROM incidents WHERE kind = 'email_failed' AND resolved_at IS NULL"),
    c("SELECT COUNT(*) AS n FROM incidents WHERE kind NOT IN ('email_failed', 'upload_rejected') AND resolved_at IS NULL"),
  ]);
  const problems = configProblems();
  const backup = await lastBackup();
  // Only an alarm once a backup has existed and gone stale (or a job failed): before the first night, it's just pending.
  const backupStale = !!backup && t - backup.at > 2 * DAY;
  const [runs, queued, stuck] = await Promise.all([
    lastRuns(),
    c("SELECT COUNT(*) AS n FROM storage_deletions"),
    c("SELECT COUNT(*) AS n FROM storage_deletions WHERE attempts >= 5"),
  ]);

  const full = (await allowances()).filter((a) => a.used >= a.limit * ALLOWANCE_WARN);
  // Most urgent first. Legal deadlines (takedowns, privacy) lead.
  const todo = [
    { n: problems.length, label: "Configuration problems", sub: problems[0] ?? "", href: "#config", tone: "danger" },
    { n: backupStale ? 1 : 0, label: "Database backup is overdue", sub: backup ? `Last one ${new Date(backup.at).toLocaleDateString("en-GB")}` : "", href: "#config", tone: "danger" },
    { n: full.length, label: "Storage is getting full", sub: full.map((a) => `${a.label} ${Math.round((a.used / a.limit) * 100)}%`).join(" · "), href: "/admin/storage", tone: "danger" },
    { n: stuck, label: "Files stuck waiting to be deleted", sub: "Storage keeps refusing them; see Storage & costs", href: "/admin/storage", tone: "danger" },
    { n: takedowns, label: "Takedown claims to decide", sub: "Copyright claims waiting for a decision", href: "/admin/takedowns", tone: "danger" },
    { n: privacy, label: "Privacy requests", sub: "Copies of data or erasure, usually due within a month", href: "/admin/privacy", tone: "danger" },
    { n: appeals, label: "Suspension appeals", sub: "People asking to be restored", href: "/admin/inbox", tone: "warn" },
    { n: failed, label: "Email failures to check", sub: "Check the address or the email service, then mark handled", href: "/admin/incidents?kind=email_failed", tone: "warn" },
    { n: incidents, label: "Open incidents", sub: "Errors the app recorded; mark each handled when dealt with", href: "/admin/incidents", tone: "warn" },
    { n: verifying, label: "Verification requests", sub: "Check the code in their bio", href: "/admin/verification", tone: "info" },
    { n: inbox, label: "Inbox messages", sub: "Support questions and reports", href: "/admin/inbox", tone: "info" },
    { n: waiting, label: "People on the waitlist", sub: "Waiting for an invite", href: "/admin/waitlist", tone: "info" },
  ].filter((x) => x.n > 0);

  const [signups, tracks, sent, failedW, senders] = await Promise.all([
    week("SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?"),
    week("SELECT COUNT(*) AS n FROM tracks WHERE created_at >= ? AND created_at < ?"),
    week("SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND created_at >= ? AND created_at < ?"),
    week("SELECT COUNT(*) AS n FROM outbox WHERE status LIKE 'failed%' AND created_at >= ? AND created_at < ?"),
    week("SELECT COUNT(DISTINCT s.email) AS n FROM tracks t JOIN senders s ON s.id = t.sender_id WHERE t.created_at >= ? AND t.created_at < ?"),
  ]);
  const [users, paid, live] = await Promise.all([
    c("SELECT COUNT(*) AS n FROM users WHERE suspended_at IS NULL"),
    c("SELECT COUNT(*) AS n FROM users WHERE suspended_at IS NULL AND plan <> 'free'"),
    c("SELECT COUNT(*) AS n FROM tracks WHERE deleted_at IS NULL AND file_key IS NOT NULL"),
  ]);
  const bytes = Number((await q.get<{ n: number | null }>("SELECT SUM(size) AS n FROM tracks WHERE deleted_at IS NULL AND file_key IS NOT NULL"))?.n ?? 0);
  const newest = await q.all<{ id: number; name: string; handle: string; created_at: number }>("SELECT id, name, handle, created_at FROM users ORDER BY created_at DESC LIMIT 5");

  const trend: [string, [number, number], boolean?][] = [
    ["New receivers", signups],
    ["Tracks received", tracks],
    ["Active senders", senders],
    ["Emails sent", sent],
    ["Emails failed", failedW, true],
  ];
  const tones: Record<string, string> = { danger: "bg-danger", warn: "bg-[#e0a33a]", info: "bg-lime" };

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-bold tracking-tight">Overview</h1>

      <section aria-labelledby="todo-h" className="space-y-3">
        <h2 id="todo-h" className="text-lg font-semibold">To do</h2>
        {todo.length ? (
          <ul className="divide-y divide-line rounded-md border border-line">
            {todo.map((x) => (
              <li key={x.label}>
                <Link href={x.href} className="flex items-center gap-4 px-4 py-3 hover:bg-ink-2">
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${tones[x.tone]}`} />
                  <span className="w-10 text-right text-xl font-bold tnum">{x.n}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{x.label}</span>
                    {x.sub && <span className="block truncate text-sm text-mute">{x.sub}</span>}
                  </span>
                  <span aria-hidden className="text-faint">→</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-lime/40 bg-lime/5 px-4 py-3 text-sm">All clear. Nothing is waiting on you.</p>
        )}
      </section>

      <section aria-labelledby="week-h" className="space-y-3">
        <h2 id="week-h" className="text-lg font-semibold">This week vs last</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {trend.map(([k, [now, prev], lowerIsBetter]) => {
            const diff = now - prev;
            const good = lowerIsBetter ? diff <= 0 : diff >= 0;
            return (
              <li key={k} className="card p-4">
                <p className="label">{k}</p>
                <p className="mt-2 text-2xl font-bold tnum">{now.toLocaleString("en")}</p>
                <p className={`mt-1 text-sm tnum ${diff === 0 ? "text-mute" : good ? "text-lime" : "text-danger"}`}>
                  {diff === 0 ? "Same as last week" : `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)}${prev ? ` (${diff > 0 ? "+" : "−"}${Math.round((Math.abs(diff) / prev) * 100)}%)` : ""} vs ${prev}`}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-mute">
          {users.toLocaleString("en")} active accounts · {paid} on a paid plan · {live.toLocaleString("en")} tracks on file ({fmtBytes(bytes)}) ·{" "}
          <Link href="/admin/metrics" className="underline">more in Metrics</Link>
        </p>
      </section>

      <section id="config" aria-labelledby="health-h">
        <h2 id="health-h" className="text-lg font-semibold">Configuration</h2>
        {problems.length ? (
          <ul className="mt-3 space-y-2">
            {problems.map((p) => (
              <li key={p} className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">{p}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-lime">Everything required is set.</p>
        )}
        <p className="mt-3 text-sm text-mute">Sign-up: {(await switchOn("open_signup")) ? "open to anyone" : "invite only"}. Emails send from {env.email.from}.</p>
        <p className="mt-1 text-sm text-mute">
          Backups: {backup ? `last ${new Date(backup.at).toLocaleString("en-GB")} · ${fmtBytes(backup.bytes)} · ${backup.rows.toLocaleString("en")} rows, encrypted, kept ${BACKUP_KEEP_DAYS} days in the storage bucket under backups/` : "the first runs with tonight's cleanup job (03:30 UTC)."}
        </p>
        <p className="mt-1 text-sm text-mute">
          Nightly cleanup: {runs.purge ? `${runs.purge.ok ? "ok" : "FAILED"} ${new Date(runs.purge.at).toLocaleString("en-GB")} (${(runs.purge.ms / 1000).toFixed(1)}s)` : "not run yet"} · Morning emails:{" "}
          {runs.digest ? `${runs.digest.ok ? "ok" : "FAILED"} ${new Date(runs.digest.at).toLocaleString("en-GB")} (${(runs.digest.ms / 1000).toFixed(1)}s)` : "not run yet"} · Files waiting to be deleted: {queued}
          {stuck ? ` (${stuck} stuck)` : ""}
        </p>
      </section>

      <section aria-labelledby="new-h">
        <h2 id="new-h" className="text-lg font-semibold">Newest receivers</h2>
        <ul className="mt-3 divide-y divide-line rounded-md border border-line">
          {newest.map((u) => (
            <li key={u.id}>
              <Link href={`/admin/accounts/${u.id}`} className="flex justify-between px-4 py-3 hover:bg-ink-2">
                <span>{u.name} <span className="text-mute">@{u.handle}</span></span>
                <span className="text-sm text-mute">{new Date(u.created_at).toLocaleDateString("en-GB")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
