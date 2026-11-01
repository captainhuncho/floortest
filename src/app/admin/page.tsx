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
/** Recent activity shows this many rows; the rest fold away. */
const FEED_SHOWN = 5;

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

  // Sign-ups and first tracks name people, so only roles that can open Users see them (security review, 1 Nov).
  const feed = ok("/admin/accounts") ? activity : activity.filter((a) => a.kind !== "signup" && a.kind !== "first");
  const activityHref = (a: { kind: string; ref: string }) => (a.kind === "signup" || a.kind === "first" ? `/admin/accounts/${a.ref}` : a.kind === "takedown" ? "/admin/takedowns" : "/admin/log");
  const activityLabel: Record<string, string> = { signup: "Sign-up", first: "First track", takedown: "Takedown", admin: "Admin" };

  // Newest receivers as a row of faces (pin 151), only for people who can open Users.
  const fresh = ok("/admin/accounts")
    ? await q.all<{ id: number; name: string; handle: string; kind: string | null }>("SELECT id, name, handle, kind FROM users ORDER BY created_at DESC LIMIT 8").catch(() => [])
    : [];

  // The header says plainly how things are: broken, needs you today, or calm (owner's review, 1 Nov).
  const soon = now.filter((x) => overdue(x) || (x.oldest != null && x.dueDays != null && (ageDays(x.oldest) ?? 0) >= x.dueDays - 1));
  const head =
    verdict.tone === "bad"
      ? { tone: "bad" as Tone, title: verdict.text, line: [...problems.slice(0, 1), ...now.slice(0, 2).map((x) => `${x.n} ${x.label.toLowerCase()}`)].join(" · ") }
      : now.length
        ? { tone: "warn" as Tone, title: soon.length ? "Needs you today" : "Needs you", line: now.slice(0, 3).map((x) => `${x.n} ${x.label.toLowerCase()}`).join(" · ") }
        : { tone: "ok" as Tone, title: "All calm", line: queue.length ? `Nothing urgent · ${queue.reduce((n, x) => n + x.n, 0)} in the queues` : "Nothing needs you right now" };
  const toneDot: Record<Tone, string> = { ok: "bg-lime", warn: "bg-[var(--admin-amber)]", bad: "bg-danger", idle: "bg-faint" };
  const toneWord: Record<Tone, string> = { ok: "OK", warn: "Warning", bad: "Problem", idle: "Not run yet" };
  const checked = new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  // Health as one score (pin 119's arc): OK counts fully, a warning half, a problem not at all; "not run yet" is left out.
  const scored = shownHealth.filter((h) => h.tone !== "idle");
  const score = scored.length ? Math.round((scored.reduce((n, h) => n + (h.tone === "ok" ? 1 : h.tone === "warn" ? 0.5 : 0), 0) / scored.length) * 100) : 100;
  const tracksNow = trend[1][1];
  const tracksBefore = trend[1][2];
  const kept = product.find((m) => m.label === "Kept");
  const listen = product.find((m) => m.label === "Time to listen");
  // Solid cards per kind of urgent item (pin 151): the colour says what sort of thing it is.
  const cardTone: Record<string, string> = { trust: "bg-[#f7b6a8] text-[#2a1410]", monitor: "bg-[#ffd98a] text-[#2a2008]", support: "bg-lime text-ink", growth: "bg-[#c9c1ff] text-[#16123a]" };
  const activityRow = (a: (typeof feed)[number], i: number) => (
    <li key={`${a.kind}-${a.created_at}-${i}`} className="border-t border-line first:border-t-0">
    <Link href={activityHref(a)} className="flex min-h-11 items-center gap-3 py-2 hover:text-bone">
      <span className={`size-2 shrink-0 rounded-full ${a.kind === "takedown" ? "bg-danger" : a.kind === "admin" ? "bg-[var(--admin-violet)]" : "bg-lime"}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px]">{a.text}</span>
        <span className="block font-mono text-[11.5px] text-faint tnum">
          {activityLabel[a.kind]} · {ago(t - Number(a.created_at))}
        </span>
      </span>
    </Link>
    </li>
  );
  const P = "admin-panel admin-rise";
  const n = (i: number) => ({ "--i": i }) as React.CSSProperties;

  return (
    <div className="space-y-6">
      {/* Headline row (pin 119): the status, then three big figures with their direction. */}
      <header className="admin-rise grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-3 text-[13px] text-mute">
            <span className="rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-bone ring-1 ring-line-2">Overview</span>
            <Link href="/admin" className="admin-press inline-flex min-h-11 items-center gap-1.5 hover:text-bone">
              Checked {checked} UTC <span className="text-bone">↻</span>
              <span className="sr-only">Refresh</span>
            </Link>
          </p>
          <h1 className="flex items-center gap-3 text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[40px]">
            <span aria-hidden className={`relative size-3 shrink-0 rounded-full ${toneDot[head.tone]} ${head.tone === "ok" ? "admin-live" : ""}`} />
            <span role="status">{head.title}</span>
          </h1>
          <p className="mt-1 text-[15px] text-mute">{head.line}</p>
          {unavailable.length > 0 && <p className="mt-1 text-[13px] text-danger">Couldn&apos;t load: {unavailable.join(", ")}</p>}
        </div>
        <dl className="grid grid-cols-3 gap-6 sm:gap-10">
          <div>
            <dt className="text-[12.5px] text-mute">Tracks this week</dt>
            <dd className="mt-1 flex items-start gap-1 text-[30px] font-semibold leading-none tracking-[-0.03em] text-lime tnum sm:text-[38px]">
              <CountUp value={tracksNow} />
              {tracksNow !== tracksBefore && <span className="text-[16px]">{tracksNow > tracksBefore ? "↗" : "↘"}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-mute">Time to listen</dt>
            <dd className="mt-1 text-[30px] font-semibold leading-none tracking-[-0.03em] text-lime tnum sm:text-[38px]">{listen?.value ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-mute">Kept</dt>
            <dd className="mt-1 text-[30px] font-semibold leading-none tracking-[-0.03em] text-lime tnum sm:text-[38px]">{kept?.value ?? "—"}</dd>
          </div>
        </dl>
      </header>

      {/* Act now: solid cards, overdue first. */}
      {now.length > 0 && (
        <section aria-labelledby="now-h" className={`${P} p-5`} style={n(1)}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="now-h" className="text-[16px] font-semibold">Act now</h2>
            <p className="flex flex-wrap gap-3 text-[12px] text-mute">
              <span>
                <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full bg-danger align-middle" />
                {now.filter(overdue).length} overdue
              </span>
              <span>{now.length} in all</span>
            </p>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[...now]
              .sort((a, b) => Number(overdue(b)) - Number(overdue(a)) || (ageDays(b.oldest) ?? 0) - (ageDays(a.oldest) ?? 0))
              .map((x, i) => {
                const age = ageDays(x.oldest);
                const late = overdue(x);
                const left = x.dueDays != null && age != null ? x.dueDays - age : null;
                return (
                  <li key={x.label} className="admin-rise" style={n(2 + i)}>
                    <Link href={x.href} className={`admin-press admin-lift flex h-full min-h-[132px] flex-col justify-between rounded-[18px] p-4 ${cardTone[x.area] ?? "bg-ink-3 text-bone"}`}>
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-[14px] font-semibold leading-snug">{x.label}</span>
                        <span aria-hidden className="text-[18px] leading-none">↗</span>
                      </span>
                      <span className="flex items-end justify-between gap-2">
                        <span className="text-[36px] font-semibold leading-none tracking-[-0.03em] tnum">{x.n}</span>
                        {left != null && (
                          <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold tnum ${late ? "bg-[#2a1410] text-[#ffb3a6]" : "bg-black/15"}`}>
                            {late ? `${-left || 0}d overdue` : left <= 0 ? "due today" : `due in ${left}d`}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Daily tracks (pin 151): bars, today lit, last week as violet ghosts. */}
        <section aria-labelledby="chart-h" className={`${P} p-5`} style={n(3)}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="chart-h" className="text-[16px] font-semibold">Tracks received</h2>
              <p className="text-[12.5px] text-faint">
                {tracksNow.toLocaleString("en-GB")} this week · {tracksBefore.toLocaleString("en-GB")} the week before
              </p>
            </div>
            <p className="flex gap-4 text-[12px] text-mute">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-[3px] bg-bone/70" />
                This week
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-[3px] bg-[var(--admin-violet)]/45" />
                Week before
              </span>
            </p>
          </div>
          <DayBars rows={series[1]} start={t - SPARK_DAYS * DAY} />
        </section>

        {/* Health as an arc of ticks (pin 119) with the six checks beside it. */}
        <section id="health" aria-labelledby="health-h" className={`${P} p-5`} style={n(4)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="health-h" className="text-[16px] font-semibold">Health</h2>
              <p className="text-[12.5px] text-faint">Jobs, backups, email and storage</p>
            </div>
          </div>
          <Gauge value={score} tone={verdict.tone === "bad" ? "bad" : score < 100 ? "warn" : "ok"} />
          <ul className="mt-1 grid grid-cols-2 gap-2">
            {shownHealth.map((h) => (
              <li key={h.label}>
                <Link href={h.href} className={`admin-lift flex h-full min-h-[56px] items-center gap-2.5 rounded-[14px] px-3 py-2 ${h.tone === "bad" ? "bg-danger/12 ring-1 ring-danger/40" : "bg-ink-3"}`}>
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${toneDot[h.tone]}`} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">
                      {h.label}
                      <span className="sr-only">: {toneWord[h.tone]}</span>
                    </span>
                    <span className={`block truncate text-[12px] ${h.tone === "bad" ? "text-danger" : "text-faint"}`}>{h.value}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {problems.length > 0 && (
            // Long lists fold (owner, 1 Nov): one line until opened.
            <details className="group mt-3 rounded-[14px] bg-danger/10 ring-1 ring-danger/40">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
                {problems.length} configuration problem{problems.length === 1 ? "" : "s"}
                <span aria-hidden className="text-faint transition-transform duration-200 group-open:rotate-180">▾</span>
              </summary>
              <ul className="space-y-1.5 px-3 pb-3">
                {problems.map((p) => (
                  <li key={p} className="text-[13px] text-mute">{p}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      {/* The week in five numbers, one panel with tiles inside (pin 119's nested cards). */}
      <section aria-labelledby="week-h" className={`${P} p-5`} style={n(5)}>
        <h2 id="week-h" className="text-[16px] font-semibold">
          This week <span className="font-normal text-faint">vs the 7 days before</span>
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {trend.map(([k, cur, prev, , lowerIsBetter], i) => {
            const diff = cur - prev;
            const pct = prev >= PCT_FROM ? ` ${Math.round((Math.abs(diff) / prev) * 100)}%` : ` ${Math.abs(diff)}`;
            const alarm = lowerIsBetter && cur > 0;
            return (
              <li key={k} className={`rounded-[16px] bg-ink-3 p-4 ${i === 4 ? "col-span-2 lg:col-span-1" : ""}`}>
                <p className="text-[12.5px] text-mute">{k}</p>
                <p className={`mt-2 text-[28px] font-semibold leading-none tracking-[-0.02em] tnum ${alarm ? "text-[var(--admin-amber)]" : ""}`}>
                  <CountUp value={cur} />
                </p>
                <p className="mt-1.5 text-[12px] text-mute tnum">{diff === 0 ? "Same as before" : `${diff > 0 ? "▲" : "▼"}${pct} vs ${prev.toLocaleString("en-GB")}`}</p>
                <Spark rows={series[i]} label={k} start={t - SPARK_DAYS * DAY} i={i} />
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Is it working: solid share blocks (pin 119's work model). */}
        <section aria-labelledby="loop-h" className={`${P} p-5`} style={n(6)}>
          <h2 id="loop-h" className="text-[16px] font-semibold">Is it working?</h2>
          <p className="text-[12.5px] text-faint">This week</p>
          {product.length ? (
            <>
              <ShareBlocks items={product.filter((m) => m.value.endsWith("%")).slice(0, 2)} />
              <ul className="mt-3 grid grid-cols-2 gap-2">
                {product
                  .filter((m) => !m.value.endsWith("%") || product.filter((x) => x.value.endsWith("%")).indexOf(m) > 1)
                  .map((m) => (
                    <li key={m.label} className="rounded-[14px] bg-ink-3 px-3 py-2.5">
                      <p className="text-[18px] font-semibold tracking-[-0.02em] tnum">{m.value}</p>
                      <p className="text-[12px] text-mute">{m.label}</p>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-[14px] text-mute">Nothing to measure yet. These fill in once receivers get tracks.</p>
          )}
        </section>

        {/* Waiting on you, then the newest faces. */}
        <section aria-labelledby="queue-h" className={`${P} p-5`} style={n(7)}>
          <h2 id="queue-h" className="text-[16px] font-semibold">Waiting on you</h2>
          {queue.length ? (
            <ul className="mt-2">
              {queue.map((x) => {
                const age = ageDays(x.oldest);
                return (
                  <li key={x.label} className="border-t border-line first:border-t-0">
                    <Link href={x.href} className="admin-press flex min-h-12 items-center gap-3 py-2 hover:text-bone">
                      <span className="grid min-w-9 place-items-center rounded-[10px] bg-ink-3 px-2 py-1 text-[14px] font-bold tnum">{x.n}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px]">{x.label}</span>
                      {age != null && age > 0 && <span className={`shrink-0 text-[12px] tnum ${overdue(x) ? "text-danger" : "text-faint"}`}>{age}d</span>}
                      <span aria-hidden className="text-faint">›</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-mute">Every queue is empty.</p>
          )}
          {fresh.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="flex items-center justify-between text-[13px] font-semibold">
                Newest receivers
                <Link href="/admin/accounts" className="min-h-11 content-center text-[12px] font-normal text-mute hover:text-bone">
                  All users ›
                </Link>
              </p>
              <ul className="mt-1 flex -space-x-2">
                {fresh.map((u, i) => (
                  <li key={u.id}>
                    <Link
                      href={`/admin/accounts/${u.id}`}
                      title={`${u.name} @${u.handle}`}
                      className="admin-press grid size-11 place-items-center rounded-full border-2 border-ink-2 text-[12px] font-bold text-ink"
                      style={{ background: ["#d5ff48", "#c9c1ff", "#f7b6a8", "#ffd98a", "#a8e6cf", "#f1f1eb"][i % 6] }}
                    >
                      {u.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                      <span className="sr-only">
                        {u.name} @{u.handle}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Recent activity, a mono time column like a log (pin 96). */}
        <section aria-labelledby="act-h" className={`${P} p-5`} style={n(8)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="act-h" className="text-[16px] font-semibold">Recent activity</h2>
            {me.access.super && (
              <Link href={withAdmin ? "/admin" : "/admin?activity=all"} className="admin-press min-h-11 content-center text-[12.5px] text-mute hover:text-bone">
                {withAdmin ? "Hide admin actions" : "Include admin actions"}
              </Link>
            )}
          </div>
          {feed.length ? (
            <>
              <ul className="mt-1">{feed.slice(0, FEED_SHOWN).map(activityRow)}</ul>
              {feed.length > FEED_SHOWN && (
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center border-t border-line text-[12.5px] text-mute hover:text-bone [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show {feed.length - FEED_SHOWN} more</span>
                    <span className="hidden group-open:inline">Show less</span>
                  </summary>
                  <ul>{feed.slice(FEED_SHOWN).map(activityRow)}</ul>
                </details>
              )}
            </>
          ) : (
            <p className="mt-2 text-[14px] text-mute">Nothing yet.</p>
          )}
        </section>
      </div>

      <p className="text-[12.5px] text-faint">
        {num(usr?.active).toLocaleString("en")} active accounts · {num(usr?.paid)} on a paid plan · {fmtBytes(bytes)} in file storage · Sign-up {signupOpen ? "open to anyone" : "invite only"} · Emails send from {env.email.from} · Files waiting to be deleted: {num(del?.queued)}
        {stuck ? ` (${stuck} stuck)` : ""} ·{" "}
        <Link href="/admin/metrics" className="underline">
          more in Metrics
        </Link>
      </p>
    </div>
  );
}

function tileOf([tone, value]: [Tone, string]) {
  return { tone, value };
}

/** Daily tracks for 14 days as bars (pin 151): last week faint violet, this week bone, today lime with its number on top. */
function DayBars({ rows, start }: { rows: { d: number; n: number }[]; start: number }) {
  const days = Array.from({ length: SPARK_DAYS }, (_, i) => Number(rows.find((r) => Number(r.d) === i)?.n ?? 0));
  const top = Math.max(1, ...days);
  const label = (i: number) => new Date(start + i * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <figure className="mt-4">
      <div className="flex h-[200px] items-end gap-1.5 sm:gap-2" role="img" aria-label={`Tracks received per day for 14 days, ${label(0)} to ${label(SPARK_DAYS - 1)}: ${days.join(", ")}. Today ${days[SPARK_DAYS - 1]}.`}>
        {days.map((v, i) => {
          const today = i === SPARK_DAYS - 1;
          return (
            <div key={i} className="relative flex h-full flex-1 flex-col justify-end">
              {today && (
                <span className="admin-fill absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full rounded-full bg-bone px-2 py-0.5 text-[11px] font-bold text-ink tnum">{v}</span>
              )}
              <span
                className={`admin-grow-y block rounded-t-[8px] rounded-b-[3px] ${today ? "bg-lime" : i < 7 ? "bg-[var(--admin-violet)]/35" : "bg-bone/60"}`}
                style={{ height: `${Math.max(3, (v / top) * 100)}%`, "--i": i } as React.CSSProperties}
                title={`${label(i)}: ${v}`}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-2 flex gap-1.5 text-[11px] text-faint sm:gap-2">
        {days.map((_, i) => (
          <span key={i} className="flex-1 text-center">
            {i % 2 === 1 || i === SPARK_DAYS - 1 ? new Date(start + i * DAY).toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" }) : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** A half circle of ticks (pin 119): lit ticks up to the score, the number and a word in the middle. */
function Gauge({ value, tone }: { value: number; tone: Tone }) {
  const ticks = 26;
  const lit = Math.round((value / 100) * ticks);
  const colour = tone === "bad" ? "var(--color-danger)" : tone === "warn" ? "var(--admin-amber)" : "var(--color-lime)";
  return (
    <div className="relative mx-auto mt-2 h-[132px] w-[240px]" role="img" aria-label={`Health score ${value} out of 100`}>
      <svg viewBox="0 0 240 132" className="absolute inset-0" aria-hidden>
        {Array.from({ length: ticks }, (_, i) => {
          const a = Math.PI - (i / (ticks - 1)) * Math.PI;
          const x1 = 120 + Math.cos(a) * 82;
          const y1 = 122 - Math.sin(a) * 82;
          const x2 = 120 + Math.cos(a) * 112;
          const y2 = 122 - Math.sin(a) * 112;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={i < lit ? colour : "var(--color-ink-4)"}
              strokeWidth="9"
              strokeLinecap="round"
              className={i < lit ? "admin-tick" : ""}
              style={{ "--i": i } as React.CSSProperties}
            />
          );
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center">
        <p className="text-[30px] font-semibold leading-none tracking-[-0.03em] tnum">{value}</p>
        <p className="text-[12px] text-mute">health score</p>
      </div>
    </div>
  );
}

/** Two shares side by side as solid blocks whose height is the share (pin 119): lime first, violet second. */
function ShareBlocks({ items }: { items: { label: string; value: string; note: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3 flex h-[150px] items-end gap-3">
      {items.map((m, i) => {
        const pct = Number(m.value.slice(0, -1)) || 0;
        return (
          <div key={m.label} className="flex h-full flex-1 flex-col justify-end">
            <div
              className={`admin-grow-y flex flex-col justify-end rounded-[18px] p-3 ${i ? "bg-[var(--admin-violet)] text-[#120d33]" : "bg-lime text-ink"}`}
              style={{ height: `${Math.max(38, pct)}%`, "--i": i } as React.CSSProperties}
            >
              <p className="text-[24px] font-semibold leading-none tracking-[-0.02em] tnum">{m.value}</p>
              <p className="mt-1 text-[11.5px] font-semibold leading-tight opacity-80">{m.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
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
