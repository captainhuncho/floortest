import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { q } from "@/lib/db";
import { parsePeriod } from "@/lib/period";
import { allPlans } from "@/lib/plan-store";
import { PeriodPicker } from "../PeriodPicker";

const money = (n: number) => `$${n.toFixed(2)}`;

/** Who's on which plan and how that's moving. There's no billing yet, so value is at list price, not money received. */
export default async function Revenue({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  await requireAdmin("revenue");
  const period = parsePeriod(await searchParams);
  const { from, to } = period;
  const byPlan = await q.all<{ plan: string; n: number }>("SELECT plan, COUNT(*)::int AS n FROM users WHERE suspended_at IS NULL GROUP BY plan");
  const count = (p: string) => byPlan.find((r) => r.plan === p)?.n ?? 0;
  const plans = await allPlans();
  const paid = plans.reduce((s, p) => s + count(p.id) * p.price, 0);
  const total = byPlan.reduce((s, r) => s + r.n, 0);
  const history = await q.all<{ handle: string; user_id: number; detail: string; created_at: number; by: string }>(
    `SELECT u.handle, u.id AS user_id, l.detail, l.created_at, 'user' AS by FROM account_log l JOIN users u ON u.id = l.user_id WHERE l.action = 'plan_changed' AND l.created_at < ?
     UNION ALL
     SELECT ltrim(a.target, '@') AS handle, COALESCE(u.id, 0) AS user_id, a.detail, a.created_at, 'admin' AS by FROM admin_log a LEFT JOIN users u ON '@' || u.handle = a.target WHERE a.action = 'changed plan' AND a.created_at < ?
     ORDER BY created_at`,
    to,
    to,
  );
  const signups = await q.count("SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?", from, to);
  const paidSignups = await q.count("SELECT COUNT(*) AS n FROM users WHERE plan <> 'free' AND created_at >= ? AND created_at < ?", from, to);
  // Up or down is by price (plans are ordered by Admin → Plans; price decides which way a change goes).
  const rank = (p: string) => plans.find((x) => x.id === p)?.price ?? -1;
  // Users' own changes are logged by plan name ("Team"), admin changes by id ("team").
  const planId = (d: string) => plans.find((p) => p.id === d || p.name.toLowerCase() === d.toLowerCase())?.id ?? d;
  for (const c of history) c.detail = planId(c.detail);
  // Walk every change oldest first, so each one is compared with the plan the account had just before it
  // (accounts start on Free), even when that earlier change was before the period.
  const planNow = new Map<number, string>();
  const inPeriod: ((typeof history)[number] & { dir: number })[] = [];
  for (const c of history) {
    const dir = Math.sign(rank(c.detail) - rank(planNow.get(c.user_id) ?? "free"));
    planNow.set(c.user_id, c.detail);
    if (c.created_at >= from) inPeriod.push({ ...c, dir });
  }
  const ups = inPeriod.filter((c) => c.dir > 0).length;
  const downs = inPeriod.filter((c) => c.dir < 0).length;
  const changes = inPeriod.reverse();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Revenue &amp; plans</h1>
        <p className="mt-2 text-mute">Billing isn&apos;t connected yet, so plans are set by hand and the value below is at list price, not money received. Payments will show here once billing is live.</p>
      </div>
      <section aria-labelledby="now-h" className="space-y-3">
        <h2 id="now-h" className="text-lg font-semibold">Right now</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Monthly value (list)", money(paid)],
          ["Paying accounts", String(count("pro") + count("team"))],
          ["Share on paid", total ? `${Math.round(((count("pro") + count("team")) / total) * 100)}%` : "—"],
          ["Accounts", String(total)],
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
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td className="px-4 py-3">{plan.name}{plan.retired && <span className="ml-2 text-xs text-faint">retired</span>}</td>
                <td className="px-4 py-3 text-mute">{plan.price ? money(plan.price) : "Free"}</td>
                <td className="px-4 py-3 tnum">{count(plan.id)}</td>
                <td className="px-4 py-3 tnum">{money(count(plan.id) * plan.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>
      <section aria-labelledby="period-h" className="space-y-4 border-t border-line pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="period-h" className="text-lg font-semibold">{period.label}</h2>
          <PeriodPicker path="/admin/revenue" period={period} />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["New accounts", signups],
            ["New on a paid plan", paidSignups],
            ["Upgrades", ups],
            ["Downgrades", downs],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md border border-line p-4">
              <p className="label">{k}</p>
              <p className="mt-1 text-2xl font-bold tnum">{v}</p>
            </div>
          ))}
        </div>
        <h3 className="pt-2 font-semibold">Plan changes</h3>
        {!changes.length && <p className="text-mute">None.</p>}
        <ul className="divide-y divide-line rounded-md border border-line">
          {changes.map((c, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
              <span>
                {c.user_id ? <Link href={`/admin/accounts/${c.user_id}`} className="hover:underline">@{c.handle}</Link> : `@${c.handle}`} → {plans.find((x) => x.id === c.detail)?.name ?? c.detail}
                <span className="text-mute"> · {c.dir > 0 ? "upgrade" : c.dir < 0 ? "downgrade" : "same plan"} · {c.by === "admin" ? "set by admin" : "by them"}</span>
              </span>
              <span className="text-mute">{new Date(c.created_at).toLocaleDateString("en-GB")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
