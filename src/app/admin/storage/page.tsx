import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { q } from "@/lib/db";
import { allowances } from "@/lib/allowance";
import { fmtBytes } from "@/lib/format";
import { RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";
import { env } from "@/lib/env";
import { AUDIT_BUCKETS, expectedFiles, lastChecks } from "@/lib/storage-audit";
import { backupNow, checkStorage } from "../actions";
import { lastVaultCopy } from "@/lib/vault";

const DAY = 86_400_000;
/** Cloudflare R2 list price per GB-month. An estimate; the real bill is in Cloudflare. */
const R2_PER_GB = 0.015;
const gb = (b: number) => b / 1024 ** 3;
const cost = (b: number) => `$${(gb(b) * R2_PER_GB).toFixed(2)}`;

/** What's stored, who stores most, what's about to be deleted, and how it's growing. */
export default async function Storage() {
  await requireAdmin("storage");
  const vaultRun = await lastVaultCopy();
  const t = Date.now();
  const n = async (sql: string, ...a: unknown[]) => Number((await q.get<{ n: string | number | null }>(sql, ...a))?.n ?? 0);
  const [live, stems, pending, files] = await Promise.all([
    n("SELECT COALESCE(SUM(size), 0) AS n FROM tracks WHERE file_key IS NOT NULL AND deleted_at IS NULL"),
    n("SELECT COALESCE(SUM(size), 0) AS n FROM stems"),
    n("SELECT COALESCE(SUM(size), 0) AS n FROM uploads"),
    n("SELECT COUNT(*) AS n FROM tracks WHERE file_key IS NOT NULL AND deleted_at IS NULL"),
  ]);
  const total = live + stems + pending;
  // Same rules as purgeExpired: unreviewed after RETAIN_UNREVIEWED_DAYS, not-for-me after RETAIN_PASSED_DAYS.
  const due = await q.get<{ n: number; b: string | number }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(size), 0) AS b FROM tracks WHERE deleted_at IS NULL AND file_key IS NOT NULL AND (
       (decision IS NULL AND created_at < ?) OR (decision = 'passed' AND decided_at < ?))`,
    t + 7 * DAY - RETAIN_UNREVIEWED_DAYS * DAY,
    t + 7 * DAY - RETAIN_PASSED_DAYS * DAY,
  );
  const top = await q.all<{ id: number; handle: string; plan: string; files: number; bytes: string | number }>(
    `SELECT u.id, u.handle, u.plan, COUNT(t.id)::int AS files, COALESCE(SUM(t.size), 0) AS bytes FROM users u JOIN tracks t ON t.user_id = u.id
     WHERE t.file_key IS NOT NULL AND t.deleted_at IS NULL GROUP BY u.id ORDER BY bytes DESC LIMIT 15`,
  );
  const months = await q.all<{ m: string; added: string | number; removed: string | number }>(
    `SELECT to_char(to_timestamp(created_at / 1000), 'YYYY-MM') AS m, SUM(size) AS added,
       SUM(CASE WHEN deleted_at IS NOT NULL THEN size ELSE 0 END) AS removed
     FROM tracks WHERE created_at > ? GROUP BY m ORDER BY m`,
    t - 365 * DAY,
  );
  const allow = await allowances();
  const peak = Math.max(1, ...months.map((m) => Number(m.added)));
  const queue = await q.all<{ file_key: string; reason: string; attempts: number; last_error: string | null; created_at: number }>(
    "SELECT file_key, reason, attempts, last_error, created_at FROM storage_deletions ORDER BY attempts DESC, created_at LIMIT 50",
  );
  const [expected, checks] = await Promise.all([expectedFiles(), lastChecks()]);
  const kinds = Object.entries(expected.reduce<Record<string, number>>((m, f) => ((m[f.kind] = (m[f.kind] ?? 0) + 1), m), {}));
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Storage &amp; costs</h1>
        <p className="mt-2 text-mute">Audio files in Cloudflare R2. Cost is estimated at R2&apos;s list price (${R2_PER_GB}/GB a month, first 10 GB free); the real bill is in Cloudflare.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Stored now", fmtBytes(total), `${files} tracks`],
          ["Estimated monthly", cost(Math.max(0, total - 10 * 1024 ** 3)), `${cost(total)} before the free 10 GB`],
          ["Stems + unfinished", fmtBytes(stems + pending), "Stems, and uploads not completed"],
          ["Deleting in 7 days", fmtBytes(Number(due?.b ?? 0)), `${due?.n ?? 0} tracks past retention`],
        ].map(([k, v, s]) => (
          <div key={k} className="rounded-md border border-line p-4">
            <p className="label">{k}</p>
            <p className="mt-1 text-2xl font-bold tnum">{v}</p>
            <p className="mt-1 text-xs text-mute">{s}</p>
          </div>
        ))}
      </div>
      <section aria-labelledby="vault-h" className="space-y-1.5 rounded-md border border-line p-4">
        <h2 id="vault-h" className="text-lg font-semibold">Recovery copy</h2>
        {env.storage.vault.bucket ? (
          vaultRun ? (
            <p className="text-sm text-mute">
              On: <span className="text-bone">{env.storage.vault.bucket}</span>. Last night: {vaultRun.copied} copied, {vaultRun.failed} failed, {vaultRun.waiting} still to copy · {vaultRun.inVault} files in the copy. Database backups are written there too. Deleting a file deletes its copy.
            </p>
          ) : (
            <p className="text-sm text-mute">On: <span className="text-bone">{env.storage.vault.bucket}</span>. The first copy runs with tonight&apos;s backup.</p>
          )
        ) : (
          <p className="text-sm text-mute">
            Off. Set <code>BACKUP_BUCKET</code>, <code>BACKUP_ACCESS_KEY_ID</code> and <code>BACKUP_SECRET_ACCESS_KEY</code> in Vercel (a second private R2 bucket; the key needs write there and read on <code>{env.storage.s3.bucket ?? "the main bucket"}</code>), then redeploy.
          </p>
        )}
      </section>
      <section aria-labelledby="move-h" className="space-y-3 rounded-md border border-line p-4">
        <h2 id="move-h" className="text-lg font-semibold">Storage move check</h2>
        <p className="text-sm text-mute">
          Before moving to another bucket: back up the database and keep the file list. After the copy: check the new bucket has every file at the
          right size, and only then switch <code>S3_BUCKET</code>. Read-only; every check is in the admin log. The app uses{" "}
          <span className="font-mono text-bone">{env.storage.s3.bucket ?? "local storage"}</span> now.
        </p>
        <p className="text-sm">
          {expected.length} files expected: {kinds.map(([k, v]) => `${v} ${k}`).join(" · ")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <form action={backupNow}>
            <button className="btn-ghost btn-sm">1. Back up the database now</button>
          </form>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download */}
          <a href="/api/admin/storage-manifest" className="btn-ghost btn-sm">
            2. Download the file list (CSV)
          </a>
          <form action={checkStorage} className="flex items-center gap-2">
            <label className="sr-only" htmlFor="check-bucket">
              Bucket to check
            </label>
            <select id="check-bucket" name="bucket" defaultValue={env.storage.s3.bucket ?? AUDIT_BUCKETS.at(-1)} className="input w-auto text-sm">
              {AUDIT_BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <button className="btn-lime btn-sm">3. Check this bucket</button>
          </form>
        </div>
        {checks.length > 0 && (
          <ul className="space-y-2 text-sm">
            {checks.map((c) => (
              <li key={c.bucket} className="rounded-md border border-line p-3">
                <p>
                  <span className="font-mono font-bold">{c.bucket}</span> · {new Date(c.at).toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
                  <span className={c.missing.length || c.wrongSize.length || !c.finished ? "text-danger" : "text-lime"}>
                    {c.present} of {c.expected} present, {c.missing.length} missing, {c.wrongSize.length} wrong size{c.finished ? "" : ", not finished"}
                  </span>
                </p>
                {(c.missing.length > 0 || c.wrongSize.length > 0) && (
                  <ul className="mt-2 max-h-48 overflow-y-auto font-mono text-xs text-mute">
                    {c.missing.map((m) => (
                      <li key={m.key}>missing · {m.kind} · {m.key}</li>
                    ))}
                    {c.wrongSize.map((m) => (
                      <li key={m.key}>
                        wrong size · {m.kind} · {m.key} · want {m.want}, got {m.got}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="allow-h" className="space-y-3">
        <h2 id="allow-h" className="text-lg font-semibold">Allowance</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {allow.map((a) => {
            const pct = Math.min(100, (a.used / a.limit) * 100);
            const tone = pct >= 90 ? "bg-danger" : pct >= 80 ? "bg-[#ffb648]" : "bg-lime";
            return (
              <li key={a.label} className="rounded-md border border-line p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">{a.label}</p>
                  <p className="text-sm tnum">{pct < 1 && a.used > 0 ? "<1" : Math.round(pct)}% full</p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-ink-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`${a.label} used`}>
                  <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.max(pct, a.used ? 1 : 0)}%` }} />
                </div>
                <p className="mt-2 text-sm tnum">{fmtBytes(a.used)} of {fmtBytes(a.limit)}</p>
                <p className="mt-1 text-xs text-mute">{a.note}</p>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Added each month</h2>
        {!months.length && <p className="text-mute">Nothing in the last year.</p>}
        <ul className="space-y-1.5">
          {months.map((m) => (
            <li key={m.m} className="grid grid-cols-[5rem_1fr_9rem] items-center gap-3 text-sm">
              <span className="text-mute tnum">{m.m}</span>
              <span className="h-2 rounded-full bg-ink-3">
                <span className="block h-2 rounded-full bg-lime" style={{ width: `${(Number(m.added) / peak) * 100}%` }} />
              </span>
              <span className="text-right tnum">{fmtBytes(Number(m.added))} <span className="text-mute">· −{fmtBytes(Number(m.removed))}</span></span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-mute">Bar: audio received that month. After the dot: how much of it has since been deleted.</p>
      </section>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-mute">
            <tr>{["Account", "Plan", "Tracks", "Stored", "Est. monthly"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {top.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3"><Link href={`/admin/accounts/${u.id}`} className="hover:underline">@{u.handle}</Link></td>
                <td className="px-4 py-3 text-mute">{u.plan}</td>
                <td className="px-4 py-3 tnum">{u.files}</td>
                <td className="px-4 py-3 tnum">{fmtBytes(Number(u.bytes))}</td>
                <td className="px-4 py-3 tnum">{cost(Number(u.bytes))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!top.length && <p className="p-6 text-mute">No audio stored.</p>}
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Waiting to be deleted ({queue.length}{queue.length === 50 ? "+" : ""})</h2>
        <p className="text-sm text-mute">Files from deleted tracks and accounts. They&apos;re normally gone within seconds; anything here is retried every night, and 5 failures raises an alert.</p>
        {!queue.length ? (
          <p className="text-sm text-lime">Nothing waiting.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line text-sm">
            {queue.map((d) => (
              <li key={d.file_key} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <span className="min-w-0 break-all">
                  {d.file_key} <span className="text-mute">· {d.reason}</span>
                  {d.last_error && <span className="block text-xs text-danger">{d.last_error}</span>}
                </span>
                <span className={d.attempts >= 5 ? "text-danger" : "text-mute"}>{d.attempts} tr{d.attempts === 1 ? "y" : "ies"} · {new Date(d.created_at).toLocaleDateString("en-GB")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
