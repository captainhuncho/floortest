import Link from "next/link";
import { q } from "@/lib/db";
import { PLANS, type PlanId } from "@/lib/plans";

const DAY = 86_400_000;
const money = (n: number) => `$${n.toFixed(2)}`;

/** Who's on which plan and how that's moving. There's no billing yet, so value is at list price, not money received. */
export default async function Revenue() {
  const t = Date.now();
  const byPlan = await q.all<{ plan: string; n: number }>("SELECT plan, COUNT(*)::int AS n FROM users WHERE suspended_at IS NULL GROUP BY plan");
  const count = (p: string) => byPlan.find((r) => r.plan === p)?.n ?? 0;
  const paid = (["pro", "team"] as PlanId[]).reduce((s, p) => s + count(p) * PLANS[p].price, 0);
  const total = byPlan.reduce((s, r) => s + r.n, 0);
  const changes = await q.all<{ handle: string; user_id: number; detail: string; created_at: number; by: string }>(
    `SELECT u.handle, u.id AS user_id, l.detail, l.created_at, 'user' AS by FROM account_log l JOIN users u ON u.id = l.user_id WHERE l.action = 'plan_changed' AND l.created_at > ?
     UNION ALL
     SELECT ltrim(a.target, '@') AS handle, COALESCE(u.id, 0) AS user_id, a.detail, a.created_at, 'admin' AS by FROM admin_log a LEFT JOIN users u ON '@' || u.handle = a.target WHERE a.action = 'changed plan' AND a.created_at > ?
     ORDER BY created_at DESC LIMIT 50`,
    t - 90 * DAY,
    t - 90 * DAY,
  );
  const paidSignups30 = await q.count("SELECT COUNT(*) AS n FROM users WHERE plan <> 'free' AND created_at > ?", t - 30 * DAY);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Revenue &amp; plans</h1>
        <p className="mt-2 text-mute">Billing isn&apos;t connected yet, so plans are set by hand and the value below is at list price, not money received. Payments will show here once billing is live.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Monthly value (list)", money(paid)],
          ["Paying accounts", String(count("pro") + count("team"))],
          ["Share on paid", total ? `${Math.round(((count("pro") + count("team")) / total) * 100)}%` : "—"],
          ["New paid, 30 days", String(paidSignups30)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-line p-4">
            <p className="label">{k}</p>
            <p className="mt-1 text-2xl font-bold tnum">{v}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-mute">
            <tr>{["Plan", "Price", "Accounts", "Monthly value"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(Object.keys(PLANS) as PlanId[]).map((p) => (
              <tr key={p}>
                <td className="px-4 py-3">{PLANS[p].name}</td>
                <td className="px-4 py-3 text-mute">{PLANS[p].price ? money(PLANS[p].price) : "Free"}</td>
                <td className="px-4 py-3 tnum">{count(p)}</td>
                <td className="px-4 py-3 tnum">{money(count(p) * PLANS[p].price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Plan changes, last 90 days</h2>
        {!changes.length && <p className="text-mute">None.</p>}
        <ul className="divide-y divide-line rounded-md border border-line">
          {changes.map((c, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
              <span>
                {c.user_id ? <Link href={`/admin/accounts/${c.user_id}`} className="hover:underline">@{c.handle}</Link> : `@${c.handle}`} → {PLANS[c.detail as PlanId]?.name ?? c.detail}
                <span className="text-mute"> · {c.by === "admin" ? "set by admin" : "by them"}</span>
              </span>
              <span className="text-mute">{new Date(c.created_at).toLocaleDateString("en-GB")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
