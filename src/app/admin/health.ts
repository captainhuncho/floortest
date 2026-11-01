import { ALLOWANCE_WARN, type allowances } from "@/lib/allowance";
import type { lastBackup } from "@/lib/backup";
import type { lastRuns } from "@/lib/cron";
import { fmtBytes } from "@/lib/format";
import type { mailUsage } from "@/lib/mail-quota";

const DAY = 86_400_000;

export type Tone = "ok" | "warn" | "bad" | "idle";
export type HealthCheck = { label: string; tone: Tone; value: string; href: string };

type Run = { ok: boolean; at: number; ms: number } | null;

/**
 * The Overview's health checks (today's Overview and the new one read the same): one per moving part, from what was
 * already read. Config, backup, the two daily jobs, the email quota and storage.
 */
export function healthChecks(input: {
  t: number;
  problems: readonly string[];
  backup: Awaited<ReturnType<typeof lastBackup>> | null;
  runs: Awaited<ReturnType<typeof lastRuns>>;
  mail: Awaited<ReturnType<typeof mailUsage>> | null;
  storage: Awaited<ReturnType<typeof allowances>>;
  /** When the first account was made: no backup at all is only an alarm once the app is two days old. */
  firstAt: number;
}) {
  const { t, problems, backup, runs, mail, storage, firstAt } = input;
  const full = storage.filter((a) => a.used >= a.limit * ALLOWANCE_WARN);
  // A backup that went stale is an alarm; so is none at all once the nightly job has been running for two days.
  const backupStale = backup ? t - backup.at > 2 * DAY : !!runs.purge && t - firstAt > 2 * DAY;
  const jobTile = (r: Run, late: number): { tone: Tone; value: string } =>
    !r
      ? { tone: "idle", value: "Not run yet" }
      : !r.ok
        ? { tone: "bad", value: `Failed ${new Date(r.at).toLocaleString("en-GB")}` }
        : t - r.at > late
          ? { tone: "warn", value: `Last ${new Date(r.at).toLocaleDateString("en-GB")}` }
          : { tone: "ok", value: `OK · ${new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC` };
  const mailPct = mail ? Math.max(mail.day / mail.limits.day, mail.month / mail.limits.month) : 0;
  const storagePct = storage.length ? Math.max(...storage.map((a) => a.used / a.limit)) : 0;
  const checks: HealthCheck[] = [
    { label: "Config", tone: problems.length ? "bad" : "ok", value: problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"}` : "All set", href: "#health" },
    { label: "Backup", tone: backupStale ? "bad" : backup ? "ok" : "idle", value: backup ? `${new Date(backup.at).toLocaleDateString("en-GB")} · ${fmtBytes(backup.bytes)}` : "First one tonight", href: "/admin/jobs" },
    { label: "Cleanup", ...jobTile(runs.purge, 1.5 * DAY), href: "/admin/jobs" },
    { label: "Digest", ...jobTile(runs.digest, 1.5 * DAY), href: "/admin/jobs" },
    { label: "Quota", tone: !mail ? "idle" : mail.warn ? "bad" : mailPct > 0.5 ? "warn" : "ok", value: mail ? `${Math.round(mailPct * 100)}% used` : "Unknown", href: "/admin/emails" },
    { label: "Storage", tone: !storage.length ? "idle" : full.length ? "bad" : storagePct > 0.5 ? "warn" : "ok", value: storage.length ? `${Math.round(storagePct * 100)}% used` : "Unknown", href: "/admin/storage" },
  ];
  return { checks, full, backupStale };
}

/** Health as one score (pin 119's arc): OK counts fully, a warning half, a problem not at all; "not run yet" is left out. */
export function healthScore(checks: readonly HealthCheck[]) {
  const scored = checks.filter((h) => h.tone !== "idle");
  return scored.length ? Math.round((scored.reduce((n, h) => n + (h.tone === "ok" ? 1 : h.tone === "warn" ? 0.5 : 0), 0) / scored.length) * 100) : 100;
}
