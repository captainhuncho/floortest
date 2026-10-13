import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { q, now } from "@/lib/db";

export const metadata = { title: "Security — FloorTest admin" };

const HOUR = 3_600_000;
/** Same thresholds as sign-in: 10 wrong passwords per account or 20 per connection in 15 minutes locks for 15 minutes. */
const LOCK_WINDOW = 15 * 60_000;
const LOCK_EMAIL = 10;
const LOCK_IP = 20;
const LOCK_2FA = 8;

const LIMITS: Record<string, string> = {
  signup_ip: "Sign-ups per connection",
  login_code_ip: "Sign-in codes per connection",
  login_code_email: "Sign-in codes per email",
  reset_ip: "Password resets per connection",
  reset_email: "Password resets per email",
  upload_ip: "Uploads per connection",
  upload_email: "Uploads per sender email",
  contact_ip: "Contact messages per connection",
  waitlist_ip: "Waitlist requests per connection",
  sent_ip: "Sender history links per connection",
  sent_email: "Sender history links per email",
  verify_email: "Confirmation emails",
  handle_check: "Link-name checks",
};

type Top = { key: string; n: number; recent: number; last: number };

/**
 * Sign-in failures, lockouts, failed bot checks and rate-limit activity, from the rate-limit records
 * (connection addresses and emails are deleted after 48 hours, so this only ever covers the last two days).
 */
const time = (ms: number) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Table({ title, rows, who, lock }: { title: string; rows: Top[]; who: (r: Top) => React.ReactNode; lock: number }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="divide-y divide-line rounded-md border border-line">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 break-all">
              {who(r)}
              {r.recent >= lock && <span className="chip ml-2 border-danger/50 text-danger">Locked now</span>}
            </span>
            <span className="text-mute tnum">
              {r.n} in 48 h · last {time(r.last)}
            </span>
          </li>
        ))}
        {!rows.length && <li className="px-3 py-4 text-mute">None in the last 48 hours.</li>}
      </ul>
    </section>
  );
}

export default async function Security() {
  await requireAdmin("security");
  const t = now();
  const since = t - 48 * HOUR;
  const top = (bucket: string, limit = 10) =>
    q.all<Top>(
      `SELECT key, COUNT(*)::int AS n, COUNT(CASE WHEN created_at > ? THEN 1 END)::int AS recent, MAX(created_at) AS last
       FROM rate_events WHERE bucket = ? AND created_at > ? GROUP BY key ORDER BY n DESC LIMIT ${limit}`,
      t - LOCK_WINDOW,
      bucket,
      since,
    );
  const total = (bucket: string, from = since) => q.count("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND created_at > ?", bucket, from);
  const [failEmails, failIps, twofa, bots] = await Promise.all([top("login_fail_email"), top("login_fail_ip"), top("twofa_fail"), top("bot_fail")]);
  const [failsDay, failsTwo, botsDay, twofaDay] = await Promise.all([total("login_fail_email", t - 24 * HOUR), total("login_fail_email"), total("bot_fail", t - 24 * HOUR), total("twofa_fail", t - 24 * HOUR)]);
  const locked = [...failEmails.filter((r) => r.recent >= LOCK_EMAIL), ...failIps.filter((r) => r.recent >= LOCK_IP), ...twofa.filter((r) => r.recent >= LOCK_2FA)];
  const pressure = await q.all<{ bucket: string; n: number; keys: number; top: number }>(
    `SELECT bucket, COUNT(*)::int AS n, COUNT(DISTINCT key)::int AS keys, MAX(c)::int AS top FROM (
       SELECT bucket, key, COUNT(*) OVER (PARTITION BY bucket, key) AS c FROM rate_events WHERE created_at > ? AND bucket = ANY(?)
     ) x GROUP BY bucket ORDER BY n DESC`,
    t - 24 * HOUR,
    Object.keys(LIMITS),
  );
  const userIds = twofa.map((r) => Number(r.key.replace("user:", ""))).filter(Number.isSafeInteger);
  const handles = new Map(
    (userIds.length ? await q.all<{ id: number; handle: string }>(`SELECT id, handle FROM users WHERE id IN (${userIds.map(() => "?").join(",")})`, ...userIds) : []).map((u) => [u.id, u.handle]),
  );
  const accounts = new Map(
    (failEmails.length
      ? await q.all<{ id: number; email: string; handle: string }>(`SELECT id, lower(email) AS email, handle FROM users WHERE lower(email) IN (${failEmails.map(() => "?").join(",")})`, ...failEmails.map((r) => r.key.toLowerCase()))
      : []
    ).map((u) => [u.email, u]),
  );
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Security</h1>
        <p className="mt-2 max-w-2xl text-mute">
          Failed sign-ins, lockouts, failed bot checks and rate limits over the last 48 hours. Connection addresses and emails in these records are deleted after
          48 hours, so nothing older is kept.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Wrong passwords, 24 h", failsDay, `${failsTwo} in 48 h`],
          ["Locked out now", locked.length, "Accounts or connections"],
          ["Wrong 2FA codes, 24 h", twofaDay, "Authenticator codes"],
          ["Failed bot checks, 24 h", botsDay, "Forms refused as likely bots"],
        ].map(([k, v, s]) => (
          <div key={String(k)} className={`rounded-md border p-4 ${k === "Locked out now" && Number(v) > 0 ? "border-danger/50" : "border-line"}`}>
            <p className="label">{k}</p>
            <p className="mt-1 text-2xl font-bold tnum">{v}</p>
            <p className="mt-1 text-xs text-mute">{s}</p>
          </div>
        ))}
      </div>
      <Table
        title="Wrong passwords by account"
        rows={failEmails}
        lock={LOCK_EMAIL}
        who={(r) => {
          const a = accounts.get(r.key.toLowerCase());
          return a ? (
            <Link href={`/admin/accounts/${a.id}`} className="underline-offset-4 hover:underline">
              {r.key} <span className="text-mute">@{a.handle}</span>
            </Link>
          ) : (
            <>
              {r.key} <span className="text-mute">(no account)</span>
            </>
          );
        }}
      />
      <Table title="Wrong passwords by connection" rows={failIps} lock={LOCK_IP} who={(r) => <span className="font-mono text-xs">{r.key}</span>} />
      <Table
        title="Wrong two-factor codes"
        rows={twofa}
        lock={LOCK_2FA}
        who={(r) => {
          const id = Number(r.key.replace("user:", ""));
          return handles.has(id) ? (
            <Link href={`/admin/accounts/${id}`} className="underline-offset-4 hover:underline">
              @{handles.get(id)}
            </Link>
          ) : (
            r.key
          );
        }}
      />
      <Table title="Failed bot checks by connection" rows={bots} lock={Infinity} who={(r) => <span className="font-mono text-xs">{r.key}</span>} />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Rate limits, last 24 hours</h2>
        <p className="text-sm text-mute">How often each limit was touched, and the most any single connection or email used it. A high top number means someone is pushing a limit.</p>
        <ul className="divide-y divide-line rounded-md border border-line">
          {pressure.map((p) => (
            <li key={p.bucket} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
              <span>{LIMITS[p.bucket] ?? p.bucket}</span>
              <span className="text-mute tnum">
                {p.n} requests · {p.keys} sources · busiest {p.top}
              </span>
            </li>
          ))}
          {!pressure.length && <li className="px-3 py-4 text-mute">No rate-limited activity in the last 24 hours.</li>}
        </ul>
      </section>
    </div>
  );
}
