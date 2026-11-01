import { can, requireAdmin } from "@/lib/admin";
import { needFor } from "@/lib/ops-perms";
import { mailUsage } from "@/lib/mail-quota";
import { partnerRows } from "@/lib/partners";
import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { CountUp } from "./CountUp";
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

  // The header says plainly how things are: broken, needs you today, or calm (owner's review, 1 Nov).
  const soon = now.filter((x) => overdue(x) || (x.oldest != null && x.dueDays != null && (ageDays(x.oldest) ?? 0) >= x.dueDays - 1));
  const head =
    verdict.tone === "bad"
      ? { tone: "bad" as Tone, title: verdict.text, line: [...problems.slice(0, 1), ...now.slice(0, 2).map((x) => `${x.n} ${x.label.toLowerCase()}`)].join(" · ") }
      : now.length
        ? { tone: "warn" as Tone, title: soon.length ? "Needs you today" : "Needs you", line: now.slice(0, 3).map((x) => `${x.n} ${x.label.toLowerCase()}`).join(" · ") }
        : { tone: "ok" as Tone, title: "All calm", line: queue.length ? `Nothing urgent. ${queue.reduce((n, x) => n + x.n, 0)} things in the queues.` : "Nothing needs you right now." };
  const toneDot: Record<Tone, string> = { ok: "bg-lime", warn: "bg-[var(--admin-amber)]", bad: "bg-danger", idle: "bg-faint" };
  const toneWord: Record<Tone, string> = { ok: "OK", warn: "Warning", bad: "Problem", idle: "Not run yet" };
  const checked = new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const panel = "admin-panel admin-rise";

  return (
    <div className="space-y-6">
      <header className="admin-rise flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-mute">Overview</p>
          <h1 className="mt-1 flex items-center gap-3 text-[28px] font-semibold tracking-[-0.02em]">
            <span aria-hidden className={`relative size-2.5 shrink-0 rounded-full ${toneDot[head.tone]} ${head.tone === "ok" ? "admin-live" : ""}`} />
            <span role="status">{head.title}</span>
          </h1>
          <p className="mt-1.5 text-[14px] text-mute">{head.line}</p>
          {unavailable.length > 0 && <p className="mt-1 text-[13px] text-danger">Couldn&apos;t load: {unavailable.join(", ")}</p>}
        </div>
        <Link href="/admin" className="admin-press btn-ghost btn-sm flex min-h-11 items-center gap-2">
          <span className="text-faint">Checked {checked} UTC</span> · Refresh
        </Link>
      </header>

      {now.length > 0 && (
        <section aria-labelledby="now-h" className={panel} style={{ "--i": 1 } as React.CSSProperties}>
          <h2 id="now-h" className="flex items-center justify-between px-5 pb-2 pt-4 text-[15px] font-semibold">
            Act now <span className="text-[12px] font-medium text-faint">Overdue first</span>
          </h2>
          <ul>
            {[...now]
              .sort((a, b) => Number(overdue(b)) - Number(overdue(a)) || (ageDays(b.oldest) ?? 0) - (ageDays(a.oldest) ?? 0))
              .map((x) => {
                const age = ageDays(x.oldest);
                const late = overdue(x);
                const left = x.dueDays != null && age != null ? x.dueDays - age : null;
                return (
                  <li key={x.label} className="border-t border-line">
                    <Link href={x.href} className="admin-press flex min-h-[60px] items-center gap-4 px-5 py-3 hover:bg-ink-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-danger/15 text-[15px] font-bold text-danger tnum">{x.n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{x.label}</span>
                        {x.sub && <span className="block truncate text-[13px] text-mute">{x.sub}</span>}
                      </span>
                      {left != null && (
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold tnum ${late ? "bg-danger/15 text-danger" : left <= 1 ? "bg-[var(--admin-amber)]/15 text-[var(--admin-amber)]" : "bg-ink-4 text-mute"}`}>
                          {late ? `${-left || 0}d overdue` : left === 0 ? "due today" : `due in ${left}d`}
                        </span>
                      )}
                      <span className="hidden shrink-0 text-[13px] font-semibold text-bone sm:block">Open →</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="queue-h" className={panel} style={{ "--i": 2 } as React.CSSProperties}>
          <h2 id="queue-h" className="px-5 pb-2 pt-4 text-[15px] font-semibold">Waiting on you</h2>
          {queue.length ? (
            <ul>
              {queue.map((x) => {
                const age = ageDays(x.oldest);
                return (
                  <li key={x.label} className="border-t border-line">
                    <Link href={x.href} className="admin-press flex min-h-[52px] items-center gap-3 px-5 py-2.5 hover:bg-ink-3">
                      <span className="w-9 shrink-0 text-right text-[15px] font-bold tnum">{x.n}</span>
                      <span className="min-w-0 flex-1 truncate">{x.label}</span>
                      {age != null && age > 0 && <span className={`shrink-0 text-[12px] tnum ${overdue(x) ? "text-danger" : "text-faint"}`}>oldest {age}d</span>}
                      <span aria-hidden className="text-faint">›</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="border-t border-line px-5 py-4 text-[14px] text-mute">Every queue is empty.</p>
          )}
        </section>

        <section id="health" aria-labelledby="health-h" className={`${panel} p-5`} style={{ "--i": 3 } as React.CSSProperties}>
          <h2 id="health-h" className="text-[15px] font-semibold">Health</h2>
          <p className="text-[12.5px] text-faint">The worst one sets the status at the top</p>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {shownHealth.map((h) => (
              <li key={h.label}>
                <Link href={h.href} className={`admin-lift flex h-full min-h-[60px] items-center gap-3 rounded-[12px] border px-3 py-2.5 ${h.tone === "bad" ? "border-danger/50 bg-danger/10" : "border-line"}`}>
                  <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${toneDot[h.tone]}`} />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold">
                      {h.label}
                      <span className="sr-only">: {toneWord[h.tone]}</span>
                    </span>
                    <span className={`block truncate text-[12.5px] ${h.tone === "bad" ? "text-danger" : "text-faint"}`}>{h.value}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {problems.length > 0 && (
            <ul className="mt-3 space-y-2">
              {problems.map((p) => (
                <li key={p} className="rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2 text-[13px]">{p}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="week-h" className="space-y-3">
        <h2 id="week-h" className="admin-rise text-[15px] font-semibold" style={{ "--i": 4 } as React.CSSProperties}>
          This week <span className="font-normal text-faint">vs the 7 days before</span>
        </h2>
        <ul className={`${panel} grid divide-line overflow-hidden sm:grid-cols-2 sm:divide-x lg:grid-cols-5`} style={{ "--i": 5 } as React.CSSProperties}>
          {trend.map(([k, cur, prev, , lowerIsBetter], i) => {
            const diff = cur - prev;
            const pct = prev >= PCT_FROM ? ` ${Math.round((Math.abs(diff) / prev) * 100)}%` : ` ${Math.abs(diff)}`;
            // Failures above zero always want a look, even when there are fewer than last week.
            const alarm = lowerIsBetter && cur > 0;
            return (
              <li key={k} className="border-t border-line p-5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 lg:border-t-0">
                <p className="text-[13px] text-mute">{k}</p>
                <p className={`mt-1.5 text-[32px] font-semibold leading-none tracking-[-0.02em] tnum ${alarm ? "text-[var(--admin-amber)]" : ""}`}>
                  <CountUp value={cur} />
                </p>
                <p className="mt-2 text-[12.5px] text-mute tnum">
                  {diff === 0 ? "Same as before" : `${diff > 0 ? "▲ up" : "▼ down"}${pct} vs ${prev.toLocaleString("en-GB")}`}
                </p>
                <Spark rows={series[i]} label={k} start={t - SPARK_DAYS * DAY} i={i} />
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="chart-h" className={`${panel} p-5`} style={{ "--i": 6 } as React.CSSProperties}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="chart-h" className="text-[15px] font-semibold">Tracks received</h2>
              <p className="text-[12.5px] text-faint">Each day this week, against the same day last week</p>
            </div>
            <p className="flex gap-4 text-[12px] text-mute">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-[2px] w-4 rounded bg-lime" />
                This week
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="w-4 border-t-2 border-dashed border-[var(--admin-violet)]" />
                Week before
              </span>
            </p>
          </div>
          <WeekChart rows={series[1]} start={t - SPARK_DAYS * DAY} />
        </section>

        <section aria-labelledby="loop-h" className={`${panel} p-5`} style={{ "--i": 7 } as React.CSSProperties}>
          <h2 id="loop-h" className="text-[15px] font-semibold">Is it working?</h2>
          <p className="text-[12.5px] text-faint">This week</p>
          {product.length ? (
            <ul className="mt-2 space-y-3.5">
              {product.map((m, i) => {
                const pct = m.value.endsWith("%") ? Number(m.value.slice(0, -1)) : null;
                return (
                  <li key={m.label}>
                    <p className="flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span>{m.label}</span>
                      <b className="font-semibold tnum">{m.value}</b>
                    </p>
                    {pct != null && (
                      <span aria-hidden className="mt-1.5 block h-2 overflow-hidden rounded-full bg-ink-4">
                        <span className="admin-grow block h-full rounded-full bg-[var(--admin-violet)]" style={{ width: `${Math.min(100, pct)}%`, "--i": i } as React.CSSProperties} />
                      </span>
                    )}
                    <p className="mt-1 text-[12px] text-faint">{m.note}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-[14px] text-mute">Nothing to measure yet. These fill in once receivers get tracks.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="act-h" className={`${panel} p-5`} style={{ "--i": 8 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="act-h" className="text-[15px] font-semibold">Recent activity</h2>
          {me.access.super && (
            <Link href={withAdmin ? "/admin" : "/admin?activity=all"} className="admin-press btn-ghost btn-sm min-h-11">
              {withAdmin ? "Hide admin actions" : "Include admin actions"}
            </Link>
          )}
        </div>
        {activity.length ? (
          <ul className="mt-2">
            {activity.map((a, i) => (
              <li key={`${a.kind}-${a.created_at}-${i}`} className="border-t border-line">
                <Link href={activityHref(a)} className="flex min-h-11 items-center gap-3 py-2 hover:text-bone">
                  <span className="w-16 shrink-0 font-mono text-[12px] text-faint tnum">{ago(t - Number(a.created_at))}</span>
                  <span
                    className={`w-24 shrink-0 rounded-[5px] border px-1.5 py-0.5 text-center text-[10.5px] font-bold uppercase tracking-[0.5px] ${a.kind === "takedown" ? "border-danger/40 text-danger" : a.kind === "admin" ? "border-[var(--admin-violet)]/50 text-[var(--admin-violet)]" : "border-line-2 text-lime"}`}
                  >
                    {activityLabel[a.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{a.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[14px] text-mute">Nothing yet.</p>
        )}
      </section>

      <p className="text-[13px] text-faint">
        {num(usr?.active).toLocaleString("en")} active accounts · {num(usr?.paid)} on a paid plan · {fmtBytes(bytes)} in file storage · Sign-up {signupOpen ? "open to anyone" : "invite only"} · Emails send from {env.email.from} · Files waiting to be deleted: {num(del?.queued)}
        {stuck ? ` (${stuck} stuck)` : ""} ·{" "}
        <Link href="/admin/metrics" className="underline">
          more in Metrics
        </Link>
      </p>
    </div>
  );
}

/** This week's daily tracks against the same weekday last week: lime line (drawn in once), violet dashed comparison. */
function WeekChart({ rows, start }: { rows: { d: number; n: number }[]; start: number }) {
  const days = Array.from({ length: SPARK_DAYS }, (_, i) => Number(rows.find((r) => Number(r.d) === i)?.n ?? 0));
  const prev = days.slice(0, 7);
  const cur = days.slice(7);
  const W = 640;
  const H = 220;
  const top = Math.max(4, ...days);
  const x = (i: number) => 36 + (i * (W - 52)) / 6;
  const y = (v: number) => H - 28 - (v / top) * (H - 48);
  const line = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const day = (i: number) => new Date(start + (7 + i) * DAY).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const total = cur.reduce((a, b) => a + b, 0);
  const before = prev.reduce((a, b) => a + b, 0);
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Tracks received this week: ${total}, against ${before} the week before. Today: ${cur[6]}.`}>
        <defs>
          <linearGradient id="wk-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-lime)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--color-lime)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={36} x2={W - 16} y1={y(top * f)} y2={y(top * f)} stroke="var(--color-line)" />
            <text x={0} y={y(top * f) + 4} fontSize="12" fill="var(--color-faint)" className="tnum">
              {Math.round(top * f)}
            </text>
          </g>
        ))}
        <path d={`${line(cur)} L${x(6)},${H - 28} L${x(0)},${H - 28} Z`} fill="url(#wk-fill)" className="admin-fill" />
        <path d={line(prev)} pathLength={1} fill="none" stroke="var(--admin-violet)" strokeWidth="1.8" strokeDasharray="0.012 0.012" opacity="0.8" />
        <path d={line(cur)} pathLength={1} fill="none" stroke="var(--color-lime)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" className="admin-draw" />
        {cur.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === 6 ? 5 : 3} fill={i === 6 ? "var(--color-lime)" : "var(--color-ink-2)"} stroke="var(--color-lime)" strokeWidth="2" className="admin-fill">
            <title>{`${day(i)}: ${v} (last week ${prev[i]})`}</title>
          </circle>
        ))}
        {cur.map((_, i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="12" fill="var(--color-faint)" textAnchor="middle">
            {day(i)}
          </text>
        ))}
      </svg>
      <figcaption className="sr-only">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>This week</th>
              <th>Week before</th>
            </tr>
          </thead>
          <tbody>
            {cur.map((v, i) => (
              <tr key={i}>
                <td>{day(i)}</td>
                <td>{v}</td>
                <td>{prev[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

function tileOf([tone, value]: [Tone, string]) {
  return { tone, value };
}

/** The last SPARK_DAYS days as a quiet bone line that draws in once; the trend in words sits above it. */
function Spark({ rows, label, start, i }: { rows: { d: number; n: number }[]; label: string; start: number; i: number }) {
  const days = Array.from({ length: SPARK_DAYS }, (_, d) => Number(rows.find((r) => Number(r.d) === d)?.n ?? 0));
  const peak = Math.max(1, ...days);
  const pts = days.map((n, d) => `${((d / (SPARK_DAYS - 1)) * 100).toFixed(1)},${(30 - (n / peak) * 26).toFixed(1)}`).join(" ");
  const from = new Date(start).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-4 block h-8 w-full" role="img" aria-label={`${label} per day since ${from}: ${days.join(", ")}`}>
      <polyline points={pts} pathLength={1} fill="none" stroke="var(--color-bone)" strokeOpacity="0.55" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" className="admin-draw" style={{ "--i": i } as React.CSSProperties} />
    </svg>
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
