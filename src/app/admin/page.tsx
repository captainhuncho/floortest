import { mailUsage } from "@/lib/mail-quota";
import { partnerRows } from "@/lib/partners";
import { switchOn } from "@/lib/switches";
import Link from "next/link";
import { configProblems, env } from "@/lib/env";
import { q } from "@/lib/db";
import { fmtBytes } from "@/lib/format";
import { ALLOWANCE_WARN, allowances } from "@/lib/allowance";
import { lastBackup } from "@/lib/backup";
import { jobProblems, lastRuns } from "@/lib/cron";

const DAY = 86_400_000;
/** Below this, week-on-week percentages are noise ("1 → 3 is +200%"), so only the difference is shown. */
const PCT_FROM = 10;

type Tone = "ok" | "warn" | "bad" | "idle";
type Todo = { n: number; label: string; sub: string; href: string; area: string; urgent?: boolean; oldest?: number | null; dueDays?: number };

/** A verdict first, then what needs acting on, how the platform is running, and how this week compares with last. */
export default async function AdminOverview() {
  const t = Date.now();
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

  // Everything at once, one query per table where possible.
  const [msg, td, usr, inc, del, wait, wk, partnersStuck, jobIssues, mail, backup, runs, storage, signupOpen] = await Promise.all([
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
    safe("job runs", lastRuns(), { purge: null, digest: null }),
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
    { n: stuck, label: "Files stuck waiting to be deleted", sub: "Storage keeps refusing them; see Storage & costs", href: "/admin/storage", area: "monitor", urgent: true },
    { n: takedowns, label: "Takedown claims to decide", sub: "Copyright claims waiting for a decision", href: "/admin/takedowns", area: "trust", urgent: true, oldest: num(td?.at) || null, dueDays: 2 },
    { n: num(msg?.privacy), label: "Privacy requests", sub: "Copies of data or erasure, due within a month", href: "/admin/privacy", area: "trust", urgent: true, oldest: num(msg?.privacy_at) || null, dueDays: 21 },
    { n: num(msg?.appeals), label: "Suspension appeals", sub: "People asking to be restored", href: "/admin/inbox", area: "trust", urgent: true, oldest: num(msg?.appeals_at) || null, dueDays: 7 },
    { n: num(inc?.failed), label: "Email failures", sub: "", href: "/admin/incidents?kind=email_failed", area: "monitor" },
    { n: num(inc?.other), label: "Open incidents", sub: "", href: "/admin/incidents", area: "monitor" },
    { n: num(msg?.inbox), label: "Inbox", sub: "", href: "/admin/inbox", area: "support", oldest: num(msg?.inbox_at) || null, dueDays: 3 },
    { n: num(msg?.feedback), label: "New feedback", sub: "", href: "/admin/feedback?status=new", area: "support" },
    { n: num(usr?.verifying), label: "Verification", sub: "", href: "/admin/verification", area: "trust" },
    { n: partnersStuck, label: "Partners to nudge", sub: "", href: "/admin/partners?show=stuck", area: "growth" },
    { n: wait, label: "Waitlist", sub: "", href: "/admin/waitlist", area: "growth" },
  ].filter((x) => x.n > 0);
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
    { label: "Nightly cleanup", ...tileOf(jobTile(runs.purge, 1.5 * DAY)), href: "/admin/jobs" },
    { label: "Morning emails", ...tileOf(jobTile(runs.digest, 1.5 * DAY)), href: "/admin/jobs" },
    { label: "Email quota", tone: !mail ? "idle" : mail.warn ? "bad" : mailPct > 0.5 ? "warn" : "ok", value: mail ? `${Math.round(mailPct * 100)}% used` : "Unknown", href: "/admin/emails" },
    { label: "Storage", tone: !storage.length ? "idle" : full.length ? "bad" : storagePct > 0.5 ? "warn" : "ok", value: storage.length ? `${Math.round(storagePct * 100)}% of the fullest` : "Unknown", href: "/admin/storage" },
  ];

  const degraded = health.some((h) => h.tone === "bad") || unavailable.length > 0;
  const verdict: { tone: Tone; text: string } = degraded
    ? { tone: "bad", text: unavailable.length && !health.some((h) => h.tone === "bad") ? "Some numbers couldn't load" : "Platform needs attention" }
    : now.length
      ? { tone: "warn", text: `${now.length} thing${now.length === 1 ? "" : "s"} need${now.length === 1 ? "s" : ""} action` }
      : { tone: "ok", text: "All clear" };

  const trend: [string, number, number, string, boolean?][] = [
    ["New receivers", num(wk?.signups), num(wk?.signups_prev), "growth"],
    ["Tracks received", num(wk?.tracks), num(wk?.tracks_prev), "monitor"],
    ["Active senders", num(wk?.senders), num(wk?.senders_prev), "support"],
    ["Emails sent", num(wk?.sent), num(wk?.sent_prev), "support"],
    ["Emails failed", num(wk?.failed), num(wk?.failed_prev), "trust", true],
  ];
  const bytes = storage[0]?.used ?? 0;
  const newest = await safe("newest receivers", q.all<{ id: number; name: string; handle: string; created_at: number }>("SELECT id, name, handle, created_at FROM users ORDER BY created_at DESC LIMIT 5"), []);

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
        <section aria-labelledby="now-h" className="space-y-3 lg:col-span-2">
          <h2 id="now-h" className="text-lg font-semibold">Act now</h2>
          {now.length ? (
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
          ) : (
            <p className="rounded-lg border border-line px-4 py-3 text-sm text-mute">Nothing urgent.</p>
          )}

          {queue.length > 0 && (
            <>
              <h3 className="label pt-2">Queue</h3>
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
            {health.map((h) => (
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
          {trend.map(([k, cur, prev, area, lowerIsBetter]) => {
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
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-mute">
          {num(usr?.active).toLocaleString("en")} active accounts · {num(usr?.paid)} on a paid plan · {fmtBytes(bytes)} in file storage ·{" "}
          <Link href="/admin/metrics" className="underline">more in Metrics</Link>
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
