import { can, requireAdmin } from "@/lib/admin";
import { needFor } from "@/lib/ops-perms";
import { mailUsage } from "@/lib/mail-quota";
import { partnerRows } from "@/lib/partners";
import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { configProblems, env } from "@/lib/env";
import { now as clock, q } from "@/lib/db";
import { fmtBytes } from "@/lib/format";
import { ALLOWANCE_WARN, allowances } from "@/lib/allowance";
import { lastBackup } from "@/lib/backup";
import { jobProblems, lastRuns } from "@/lib/cron";

const DAY = 86_400_000;
/** Below this, week-on-week percentages are noise ("1 → 3 is +200%"), so only the difference is shown. */
const PCT_FROM = 10;
/** Days shown in each weekly card's mini chart. */
const SPARK_DAYS = 14;

type Tone = "ok" | "warn" | "bad" | "idle";
type Todo = { n: number; label: string; sub: string; href: string; area: string; urgent?: boolean; oldest?: number | null; dueDays?: number };

/** A verdict first, then what needs acting on, how the platform is running, and how this week compares with last. */
export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ activity?: string }> }) {
  const withAdminParam = (await searchParams).activity === "all";
  const me = await requireAdmin("overview");
  // The admin log is the super admin's alone, so only they can mix admin actions into the activity feed.
  const withAdmin = withAdminParam && me.access.super;
  // Each person sees only the items and tiles for areas they can open.
  const ok = (href: string) => href.startsWith("#") || can(me.access, needFor(href.split(/[?#]/)[0]));
  const t = clock();
  const w0 = t - 7 * DAY;
  const w1 = t - 14 * DAY;
  // One failing query hides its own panel, not the whole page.
  const unavailable: string[] = [];
  const safe = <T,>(name: string, p: Promise<T>, fallback: T) =>
    p.catch((e) => {
      console.error(`admin overview: ${name}`, e);
      unavailable.push(name);
      return fallback;
    });
  const num = (v: unknown) => Number(v ?? 0);

  // Round two, started first so it runs alongside the rest: the review loop, daily series and recent activity.
  const median = (name: string, sql: string, ...a: number[]) =>
    safe(name, q.get<{ m: number | null }>(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v) AS m FROM (${sql}) x`, ...a).then((r) => (r?.m == null ? null : Number(r.m))), null);
  const daily = (name: string, sql: string) =>
    safe(name, q.all<{ d: number; n: number }>(`SELECT FLOOR((created_at - ?) / ${DAY}) AS d, COUNT(*) AS n FROM (${sql}) x GROUP BY 1`, t - SPARK_DAYS * DAY, t - SPARK_DAYS * DAY), [] as { d: number; n: number }[]);
  const roundTwo = Promise.all([
    median("time to listen", "SELECT played_at - created_at AS v FROM tracks WHERE played_at IS NOT NULL AND created_at >= ?", w0),
    median("time to decide", "SELECT decided_at - created_at AS v FROM tracks WHERE decided_at IS NOT NULL AND created_at >= ?", w0),
    safe(
      "review loop",
      q.get<Record<string, unknown>>(
        `SELECT
           (SELECT COUNT(*) FROM tracks WHERE decision IS NOT NULL AND decided_at >= ?) AS decided,
           (SELECT COUNT(*) FROM tracks WHERE decision = 'kept' AND decided_at >= ?) AS kept,
           (SELECT COUNT(DISTINCT user_id) FROM account_log WHERE created_at >= ?) AS active,
           (SELECT COUNT(*) FROM users u WHERE EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id)) AS activated,
           (SELECT COUNT(*) FROM users) AS receivers`,
        w0, w0, w0,
      ),
      undefined,
    ),
    Promise.all([
      daily("daily sign-ups", "SELECT created_at FROM users WHERE created_at >= ?"),
      daily("daily tracks", "SELECT created_at FROM tracks WHERE created_at >= ?"),
      daily("daily senders", "SELECT MIN(t.created_at) AS created_at FROM tracks t JOIN senders s ON s.id = t.sender_id WHERE t.created_at >= ? GROUP BY s.email, FLOOR(t.created_at / 86400000)"),
      daily("daily emails", "SELECT created_at FROM outbox WHERE status = 'sent' AND created_at >= ?"),
      daily("daily failures", "SELECT created_at FROM outbox WHERE status LIKE 'failed%' AND created_at >= ?"),
    ]),
    safe(
      "recent activity",
      q.all<{ kind: string; text: string; ref: string; created_at: number }>(
        `SELECT * FROM (
           SELECT 'signup' AS kind, name || ' @' || handle AS text, CAST(id AS text) AS ref, created_at FROM users
           UNION ALL SELECT 'takedown', 'Takedown claim received', CAST(id AS text), created_at FROM takedowns
           UNION ALL SELECT 'first', u.name || ' received their first track', CAST(u.id AS text), MIN(t.created_at) FROM users u JOIN tracks t ON t.user_id = u.id GROUP BY u.id, u.name
           UNION ALL SELECT 'admin', action || CASE WHEN target <> '' THEN ' · ' || target ELSE '' END, '', created_at FROM admin_log WHERE ? = 1 AND action NOT IN ('signed in to ops', 'signed out of ops')
         ) a ORDER BY created_at DESC LIMIT 8`,
        withAdmin ? 1 : 0,
      ),
      [],
    ),
  ]);

  // Everything at once, one query per table where possible.
  const [msg, td, usr, inc, del, wait, planReq, wk, partnersStuck, jobIssues, mail, backup, runs, storage, signupOpen] = await Promise.all([
    safe(
      "messages",
      q.get<Record<string, unknown>>(
        `SELECT
           COUNT(*) FILTER (WHERE topic LIKE 'Feedback%' AND feedback_status = 'new') AS feedback,
           COUNT(*) FILTER (WHERE handled_at IS NULL AND topic = 'Suspension appeal') AS appeals,
           MIN(created_at) FILTER (WHERE handled_at IS NULL AND topic = 'Suspension appeal') AS appeals_at,
           COUNT(*) FILTER (WHERE handled_at IS NULL AND topic = 'Privacy request') AS privacy,
           MIN(created_at) FILTER (WHERE handled_at IS NULL AND topic = 'Privacy request') AS privacy_at,
           COUNT(*) FILTER (WHERE handled_at IS NULL AND topic NOT IN ('Suspension appeal', 'Privacy request') AND topic NOT LIKE 'Feedback%') AS inbox,
           MIN(created_at) FILTER (WHERE handled_at IS NULL AND topic NOT IN ('Suspension appeal', 'Privacy request') AND topic NOT LIKE 'Feedback%') AS inbox_at
         FROM contact_messages`,
      ),
      undefined,
    ),
    safe("takedowns", q.get<Record<string, unknown>>("SELECT COUNT(*) AS n, MIN(created_at) AS at FROM takedowns WHERE status = 'open'"), undefined),
    safe(
      "accounts",
      q.get<Record<string, unknown>>(
        `SELECT
           COUNT(*) FILTER (WHERE identity_status = 'pending') AS verifying,
           COUNT(*) FILTER (WHERE suspended_at IS NULL) AS active,
           COUNT(*) FILTER (WHERE suspended_at IS NULL AND plan <> 'free') AS paid,
           MIN(created_at) AS first_at
         FROM users`,
      ),
      undefined,
    ),
    safe(
      "incidents",
      q.get<Record<string, unknown>>(
        `SELECT
           COUNT(*) FILTER (WHERE kind = 'email_failed') AS failed,
           COUNT(*) FILTER (WHERE kind NOT IN ('email_failed', 'upload_rejected')) AS other
         FROM incidents WHERE resolved_at IS NULL`,
      ),
      undefined,
    ),
    safe("deletions", q.get<Record<string, unknown>>("SELECT COUNT(*) AS queued, COUNT(*) FILTER (WHERE attempts >= 5) AS stuck FROM storage_deletions"), undefined),
    safe("waitlist", q.count("SELECT COUNT(*) AS n FROM waitlist WHERE invited_at IS NULL"), 0),
    safe("plan requests", q.get<Record<string, unknown>>("SELECT COUNT(*) AS n, MIN(created_at) AS at FROM plan_requests WHERE status = 'pending'"), undefined),
    safe(
      "weekly numbers",
      q.get<Record<string, unknown>>(
        `SELECT
           (SELECT COUNT(*) FROM users WHERE created_at >= ? AND created_at < ?) AS signups,
           (SELECT COUNT(*) FROM users WHERE created_at >= ? AND created_at < ?) AS signups_prev,
           (SELECT COUNT(*) FROM tracks WHERE created_at >= ? AND created_at < ?) AS tracks,
           (SELECT COUNT(*) FROM tracks WHERE created_at >= ? AND created_at < ?) AS tracks_prev,
           (SELECT COUNT(DISTINCT s.email) FROM tracks t JOIN senders s ON s.id = t.sender_id WHERE t.created_at >= ? AND t.created_at < ?) AS senders,
           (SELECT COUNT(DISTINCT s.email) FROM tracks t JOIN senders s ON s.id = t.sender_id WHERE t.created_at >= ? AND t.created_at < ?) AS senders_prev,
           (SELECT COUNT(*) FROM outbox WHERE status = 'sent' AND created_at >= ? AND created_at < ?) AS sent,
           (SELECT COUNT(*) FROM outbox WHERE status = 'sent' AND created_at >= ? AND created_at < ?) AS sent_prev,
           (SELECT COUNT(*) FROM outbox WHERE status LIKE 'failed%' AND created_at >= ? AND created_at < ?) AS failed,
           (SELECT COUNT(*) FROM outbox WHERE status LIKE 'failed%' AND created_at >= ? AND created_at < ?) AS failed_prev`,
        ...Array.from({ length: 5 }, () => [w0, t, w1, w0]).flat(),
      ),
      undefined,
    ),
    safe("beta partners", partnerRows().then((r) => r.filter((x) => x.flag).length), 0),
    safe("jobs", jobProblems(t), [] as string[]),
    safe("email quota", mailUsage(), null),
    safe("backups", lastBackup(), null),
    safe("job runs", lastRuns(), { purge: null, digest: null, scan: null, mail: null }),
    safe("storage", allowances(), []),
    safe("sign-up mode", switchOn("open_signup"), false),
  ]);

  const problems = configProblems();
  const takedowns = num(td?.n);
  const full = storage.filter((a) => a.used >= a.limit * ALLOWANCE_WARN);
  // A backup that went stale is an alarm; so is none at all once the nightly job has been running for two days.
  const backupStale = backup ? t - backup.at > 2 * DAY : !!runs.purge && t - num(usr?.first_at) > 2 * DAY;
  const stuck = num(del?.stuck);

  const todo: Todo[] = [
    { n: problems.length, label: "Configuration problems", sub: problems[0] ?? "", href: "#health", area: "monitor", urgent: true },
    { n: mail?.warn ? 1 : 0, label: "Close to the email sending limit", sub: mail ? `${mail.day} of ${mail.limits.day} today · ${mail.month} of ${mail.limits.month} this month. Upgrade Resend before it runs out.` : "", href: "/admin/emails", area: "monitor", urgent: true },
    { n: jobIssues.length, label: "Scheduled job failed or late", sub: jobIssues[0] ?? "", href: "/admin/jobs", area: "monitor", urgent: true },
    { n: backupStale ? 1 : 0, label: backup ? "Database backup is overdue" : "No database backup yet", sub: backup ? `Last one ${new Date(backup.at).toLocaleDateString("en-GB")}` : "The nightly job is running but hasn't saved a backup", href: "/admin/jobs", area: "monitor", urgent: true },
    { n: full.length, label: "Storage is getting full", sub: full.map((a) => `${a.label} ${Math.round((a.used / a.limit) * 100)}%`).join(" · "), href: "/admin/storage", area: "monitor", urgent: true },
    { n: stuck, label: "Files stuck waiting to be deleted", sub: "Storage keeps refusing them; see Storage", href: "/admin/storage", area: "monitor", urgent: true },
    { n: takedowns, label: "Takedown claims to decide", sub: "Copyright claims waiting for a decision", href: "/admin/takedowns", area: "trust", urgent: true, oldest: num(td?.at) || null, dueDays: 2 },
    { n: num(msg?.privacy), label: "Privacy requests", sub: "Copies of data or erasure, due within a month", href: "/admin/privacy", area: "trust", urgent: true, oldest: num(msg?.privacy_at) || null, dueDays: 21 },
    { n: num(msg?.appeals), label: "Suspension appeals", sub: "People asking to be restored", href: "/admin/inbox", area: "trust", urgent: true, oldest: num(msg?.appeals_at) || null, dueDays: 7 },
    { n: num(inc?.failed), label: "Email failures", sub: "", href: "/admin/incidents?kind=email_failed", area: "monitor" },
    { n: num(inc?.other), label: "Open incidents", sub: "", href: "/admin/incidents", area: "monitor" },
    { n: num(msg?.inbox), label: "Inbox", sub: "", href: "/admin/inbox", area: "support", oldest: num(msg?.inbox_at) || null, dueDays: 3 },
    { n: num(msg?.feedback), label: "New feedback", sub: "", href: "/admin/feedback?status=new", area: "support" },
    { n: num(usr?.verifying), label: "Verification", sub: "", href: "/admin/verification", area: "trust" },
    { n: partnersStuck, label: "Partners to nudge", sub: "", href: "/admin/partners?show=stuck", area: "growth" },
    { n: num(planReq?.n), label: "Plan requests", sub: "", href: "/admin/plan-requests", area: "growth", oldest: num(planReq?.at) || null, dueDays: 2 },
    { n: wait, label: "Waitlist", sub: "", href: "/admin/waitlist", area: "growth" },
  ].filter((x) => x.n > 0 && ok(x.href));
  const now = todo.filter((x) => x.urgent);
  const queue = todo.filter((x) => !x.urgent);

  const ageDays = (at?: number | null) => (at ? Math.floor((t - at) / DAY) : null);
  const overdue = (x: Todo) => x.oldest != null && x.dueDays != null && (ageDays(x.oldest) ?? 0) >= x.dueDays;

  // Health: one tile per moving part, worst state wins the verdict.
  const jobTile = (r: { ok: boolean; at: number; ms: number } | null, late: number): [Tone, string] =>
    !r ? ["idle", "Not run yet"] : !r.ok ? ["bad", `Failed ${new Date(r.at).toLocaleString("en-GB")}`] : t - r.at > late ? ["warn", `Last ${new Date(r.at).toLocaleDateString("en-GB")}`] : ["ok", `OK · ${new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC`];
  const mailPct = mail ? Math.max(mail.day / mail.limits.day, mail.month / mail.limits.month) : 0;
  const storagePct = storage.length ? Math.max(...storage.map((a) => a.used / a.limit)) : 0;
  const health: { label: string; tone: Tone; value: string; href: string }[] = [
    { label: "Config", tone: problems.length ? "bad" : "ok", value: problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"}` : "All set", href: "#health" },
    { label: "Backup", tone: backupStale ? "bad" : backup ? "ok" : "idle", value: backup ? `${new Date(backup.at).toLocaleDateString("en-GB")} · ${fmtBytes(backup.bytes)}` : "First one tonight", href: "/admin/jobs" },
    { label: "Cleanup", ...tileOf(jobTile(runs.purge, 1.5 * DAY)), href: "/admin/jobs" },
    { label: "Digest", ...tileOf(jobTile(runs.digest, 1.5 * DAY)), href: "/admin/jobs" },
    { label: "Quota", tone: !mail ? "idle" : mail.warn ? "bad" : mailPct > 0.5 ? "warn" : "ok", value: mail ? `${Math.round(mailPct * 100)}% used` : "Unknown", href: "/admin/emails" },
    { label: "Storage", tone: !storage.length ? "idle" : full.length ? "bad" : storagePct > 0.5 ? "warn" : "ok", value: storage.length ? `${Math.round(storagePct * 100)}% used` : "Unknown", href: "/admin/storage" },
  ];
  const shownHealth = health.filter((h) => ok(h.href));

  const degraded = health.some((h) => h.tone === "bad") || unavailable.length > 0;
  const verdict: { tone: Tone; text: string } = degraded
    ? { tone: "bad", text: unavailable.length && !health.some((h) => h.tone === "bad") ? "Some numbers couldn't load" : "Platform needs attention" }
    : now.length
      ? { tone: "warn", text: `${now.length} thing${now.length === 1 ? "" : "s"} need${now.length === 1 ? "s" : ""} action` }
      : { tone: "ok", text: queue.length ? "All clear · nothing urgent" : "All clear · nothing waiting on you" };

  const trend: [string, number, number, string, boolean?][] = [
    ["New receivers", num(wk?.signups), num(wk?.signups_prev), "growth"],
    ["Tracks received", num(wk?.tracks), num(wk?.tracks_prev), "monitor"],
    ["Active senders", num(wk?.senders), num(wk?.senders_prev), "support"],
    ["Emails sent", num(wk?.sent), num(wk?.sent_prev), "support"],
    ["Emails failed", num(wk?.failed), num(wk?.failed_prev), "trust", true],
  ];
  const bytes = storage[0]?.used ?? 0;
  const [toListen, toDecide, loop, series, activity] = await roundTwo;
  const decided = num(loop?.decided);
  const receivers = num(loop?.receivers);
  const active = num(usr?.active);
  const paid = num(usr?.paid);
  const activated = num(loop?.activated);
  const share = (n: number, of: number) => (of >= PCT_FROM ? `${Math.round((n / of) * 100)}%` : `${n} of ${of}`);
  // Cards with nothing to measure yet are left out rather than shown as dashes.
  const product = [
    { label: "Active receivers", value: share(num(loop?.active), receivers), note: "used their desk this week", area: "growth", show: receivers > 0 },
    { label: "Time to listen", value: dur(toListen), note: "median, tracks sent this week", area: "monitor", show: toListen != null },
    { label: "Time to decide", value: dur(toDecide), note: "median, keep or pass", area: "monitor", show: toDecide != null },
    { label: "Kept", value: share(num(loop?.kept), decided), note: "of tracks decided this week", area: "support", show: decided > 0 },
    { label: "Activated", value: share(activated, receivers), note: "receivers who have had a track", area: "growth", show: receivers > 0 },
    { label: "Paid", value: share(paid, active), note: "active accounts on a paid plan", area: "growth", show: paid > 0 },
  ].filter((m) => m.show);

  const activityHref = (a: { kind: string; ref: string }) => (a.kind === "signup" || a.kind === "first" ? `/admin/accounts/${a.ref}` : a.kind === "takedown" ? "/admin/takedowns" : "/admin/log");
  const activityLabel: Record<string, string> = { signup: "Sign-up", first: "First track", takedown: "Takedown", admin: "Admin" };

  const dot: Record<Tone, string> = { ok: "bg-lime", warn: "bg-[#e0a33a]", bad: "bg-danger", idle: "bg-faint" };
  const banner: Record<Tone, string> = { ok: "border-lime/40 bg-lime/5", warn: "border-[#e0a33a]/50 bg-[#e0a33a]/10", bad: "border-danger/50 bg-danger/10", idle: "border-line" };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Overview</h1>

      <p role="status" className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-lg font-bold ${banner[verdict.tone]}`}>
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${dot[verdict.tone]}`} />
        {verdict.text}
        {unavailable.length > 0 && <span className="text-sm font-normal text-mute">Couldn&apos;t load: {unavailable.join(", ")}</span>}
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby={now.length ? "now-h" : "queue-h"} className="space-y-3 lg:col-span-2">
          {now.length > 0 && <h2 id="now-h" className="text-lg font-semibold">Act now</h2>}
          {now.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {now.map((x) => {
                const age = ageDays(x.oldest);
                return (
                  <li key={x.label} data-area={x.area}>
                    <Link href={x.href} className="flex items-center gap-4 border-l-2 border-[var(--area)] px-4 py-3 hover:bg-ink-2">
                      <span className="w-8 text-right text-xl font-bold tnum">{x.n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{x.label}</span>
                        {x.sub && <span className="block truncate text-sm text-mute">{x.sub}</span>}
                      </span>
                      {age != null && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tnum ${overdue(x) ? "bg-danger/15 text-danger" : "bg-ink-3 text-mute"}`}>
                          oldest {age === 0 ? "today" : `${age}d`}
                        </span>
                      )}
                      <span aria-hidden className="text-faint">→</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {queue.length > 0 && (
            <>
              {now.length ? <h3 id="queue-h" className="label pt-2">Queue</h3> : <h2 id="queue-h" className="text-lg font-semibold">Waiting on you</h2>}
              <ul className="flex flex-wrap gap-2">
                {queue.map((x) => {
                  const age = ageDays(x.oldest);
                  return (
                    <li key={x.label} data-area={x.area}>
                      <Link href={x.href} className="flex items-center gap-2 rounded-full border border-line bg-ink-2 px-3 py-1.5 text-sm hover:border-[var(--area)]">
                        <span aria-hidden className="area-dot size-1.5 rounded-full" />
                        <span className="font-bold tnum">{x.n}</span>
                        {x.label}
                        {age != null && age > 0 && <span className={`text-xs tnum ${overdue(x) ? "text-danger" : "text-faint"}`}>· {age}d</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section id="health" aria-labelledby="health-h" className="space-y-3">
          <h2 id="health-h" className="text-lg font-semibold">Health</h2>
          <ul className="grid grid-cols-2 gap-2">
            {shownHealth.map((h) => (
              <li key={h.label}>
                <Link href={h.href} className="block h-full rounded-lg border border-line bg-ink-2 p-3 hover:border-line-2">
                  <span className="label flex items-center gap-2">
                    <span aria-hidden className={`size-2 rounded-full ${dot[h.tone]}`} />
                    {h.label}
                  </span>
                  <span className={`mt-1 block text-sm font-semibold ${h.tone === "bad" ? "text-danger" : ""}`}>{h.value}</span>
                </Link>
              </li>
            ))}
          </ul>
          {problems.length > 0 && (
            <ul className="space-y-2">
              {problems.map((p) => (
                <li key={p} className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">{p}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="week-h" className="space-y-3">
        <h2 id="week-h" className="text-lg font-semibold">Last 7 days vs the 7 before</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {trend.map(([k, cur, prev, area, lowerIsBetter], i) => {
            const diff = cur - prev;
            const good = lowerIsBetter ? diff <= 0 : diff >= 0;
            const pct = prev >= PCT_FROM ? ` (${diff > 0 ? "+" : "−"}${Math.round((Math.abs(diff) / prev) * 100)}%)` : "";
            return (
              <li key={k} data-area={area} className="card area-card p-4">
                <p className="label flex items-center gap-2">
                  <span aria-hidden className="area-dot size-1.5 rounded-full" />
                  {k}
                </p>
                <p className="mt-2 text-2xl font-bold tnum">{cur.toLocaleString("en")}</p>
                <p className={`mt-1 text-sm tnum ${diff === 0 ? "text-mute" : good ? "text-lime" : "text-danger"}`}>
                  {diff === 0 ? "Same as before" : `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)}${pct} vs ${prev}`}
                </p>
                <Spark rows={series[i]} label={k} start={t - SPARK_DAYS * DAY} />
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-mute">
          {num(usr?.active).toLocaleString("en")} active accounts · {num(usr?.paid)} on a paid plan · {fmtBytes(bytes)} in file storage ·{" "}
          <Link href="/admin/metrics" className="underline">more in Metrics</Link>
        </p>
      </section>

      <section aria-labelledby="loop-h" className="space-y-3">
        <h2 id="loop-h" className="text-lg font-semibold">Is it working?</h2>
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          {product.map((m) => (
            <li key={m.label} data-area={m.area} className="card p-4">
              <p className="label flex items-center gap-2">
                <span aria-hidden className="area-dot size-1.5 rounded-full" />
                {m.label}
              </p>
              <p className="mt-2 text-2xl font-bold tnum">{m.value}</p>
              <p className="mt-1 text-xs text-mute">{m.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="act-h">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="act-h" className="text-lg font-semibold">Recent activity</h2>
          {me.access.super && (
            <Link href={withAdmin ? "/admin" : "/admin?activity=all"} className="text-sm text-mute underline hover:text-bone">
              {withAdmin ? "Hide admin actions" : "Include admin actions"}
            </Link>
          )}
        </div>
        {activity.length ? (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line">
            {activity.map((a, i) => (
              <li key={`${a.kind}-${a.created_at}-${i}`}>
                <Link href={activityHref(a)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-2">
                  <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-[1px] text-faint">{activityLabel[a.kind]}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{a.text}</span>
                  <span className="shrink-0 text-xs text-mute tnum">{ago(t - Number(a.created_at))}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-mute">Nothing yet.</p>
        )}
      </section>

      <p className="text-sm text-mute">
        Sign-up: {signupOpen ? "open to anyone" : "invite only"} · Emails send from {env.email.from} · Files waiting to be deleted: {num(del?.queued)}
        {stuck ? ` (${stuck} stuck)` : ""}
      </p>
    </div>
  );
}

function tileOf([tone, value]: [Tone, string]) {
  return { tone, value };
}

/** A small bar per day for the last SPARK_DAYS days, in the card's area colour; the last 7 are brighter. */
function Spark({ rows, label, start }: { rows: { d: number; n: number }[]; label: string; start: number }) {
  const days = Array.from({ length: SPARK_DAYS }, (_, i) => Number(rows.find((r) => Number(r.d) === i)?.n ?? 0));
  const peak = Math.max(1, ...days);
  const day = (i: number) => new Date(start + i * DAY).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div role="img" aria-label={`${label}, last ${SPARK_DAYS} days: ${days.join(", ")}`} className="mt-3">
      <div className="flex h-8 items-end gap-[2px]">
        {days.map((n, i) => (
          <span
            key={i}
            title={`${day(i)}: ${n}`}
            className={`flex-1 rounded-[1px] bg-[var(--area)] ${i < SPARK_DAYS - 7 ? "opacity-35" : "opacity-90"} ${i === SPARK_DAYS - 7 ? "ml-1" : ""}`}
            style={{ height: `${Math.max(6, (n / peak) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-faint">
        <span>2 weeks ago</span>
        <span>this week</span>
      </div>
    </div>
  );
}

/** 95 minutes → "1.6h", 3 days → "3.0d". */
function dur(ms: number | null) {
  if (ms == null) return "—";
  const h = ms / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;
}

function ago(ms: number) {
  const m = Math.floor(ms / 60_000);
  return m < 60 ? `${Math.max(1, m)}m ago` : m < 2880 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
}
