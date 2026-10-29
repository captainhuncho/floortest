import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { httpsLink } from "@/lib/safe-links";
import { allPlans } from "@/lib/plan-store";
import { grantablePlan, REQUEST_KINDS, type PlanRequest } from "@/lib/plan-requests";
import { approvePlanRequest, declinePlanRequest } from "../actions";
import { ConfirmSubmit } from "../AdminUi";

type Row = PlanRequest & { handle: string; name: string; email: string; current: string; account_kind: string | null; tracks: number };

const when = (t: number) => new Date(Number(t)).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const kindLabel = (k: string) => REQUEST_KINDS[k as keyof typeof REQUEST_KINDS] ?? k;

/** Beta plan requests: who's asking for Pro or Team, and what they are, so each gets the plan that fits. */
export default async function PlanRequests() {
  await requireAdmin("planRequests");
  const [pending, recent, plans] = await Promise.all([
    q.all<Row>(
      `SELECT r.*, u.handle, u.name, u.email, u.plan AS current, u.kind AS account_kind,
         (SELECT COUNT(*) FROM tracks t WHERE t.user_id = u.id AND t.deleted_at IS NULL) AS tracks
       FROM plan_requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' ORDER BY r.created_at`,
    ),
    q.all<Row>(
      `SELECT r.*, u.handle, u.name, u.email, u.plan AS current, u.kind AS account_kind, 0 AS tracks
       FROM plan_requests r JOIN users u ON u.id = r.user_id WHERE r.status IN ('approved', 'declined') ORDER BY r.decided_at DESC LIMIT 20`,
    ),
    allPlans(),
  ]);
  const offered = plans.filter((p) => !p.retired && p.price > 0);
  const nameOf = (id: string | null) => plans.find((p) => p.id === id)?.name ?? id ?? "";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plan requests</h1>
        <p className="mt-2 max-w-2xl text-mute">
          During the beta, Pro and Team are given on request. Check who they are, then approve the plan that fits (it can be a different one from what
          they asked for). They&apos;re emailed either way. Once paid plans start, people choose for themselves.
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="rounded-lg border border-line px-4 py-3 text-sm text-mute">Nothing waiting.</p>
      ) : (
        <ul className="space-y-4">
          {pending.map((r) => (
            <li key={r.id} className="overflow-hidden rounded-md border border-line bg-ink-2">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <p className="font-bold">
                  <Link href={`/admin/accounts/${r.user_id}`} className="hover:underline">{r.name}</Link> <span className="font-normal text-mute">@{r.handle}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="chip border-line text-mute">On {nameOf(r.current)}</span>
                  <span className="chip border-lime/50 text-lime">Wants {nameOf(r.plan)}</span>
                  <span className="chip border-line text-mute">{when(r.created_at)}</span>
                </div>
              </header>
              <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
                <div><dt className="label">What they are</dt><dd>{kindLabel(r.kind)}{r.account_kind ? <span className="text-mute"> · signed up as {r.account_kind}</span> : null}</dd></div>
                <div><dt className="label">Name or company</dt><dd>{r.org || <span className="text-mute">Not given</span>}</dd></div>
                <div>
                  <dt className="label">Link</dt>
                  <dd className="truncate">{r.link ? httpsLink(r.link) ? <a href={httpsLink(r.link)!} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">{r.link}</a> : r.link : <span className="text-mute">Not given</span>}</dd>
                </div>
                <div><dt className="label">Tracks a month</dt><dd>{r.volume || <span className="text-mute">Not sure</span>} <span className="text-mute">· {r.tracks} on their desk now</span></dd></div>
                {r.note && <div className="sm:col-span-2"><dt className="label">Note</dt><dd className="whitespace-pre-wrap">{r.note}</dd></div>}
              </dl>
              <div className="grid gap-4 border-t border-line bg-ink px-5 py-4 lg:grid-cols-2">
                <form action={approvePlanRequest.bind(null, r.id)} className="space-y-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block space-y-1.5">
                      <span className="label">Give them</span>
                      <select name="plan" defaultValue={r.plan} className="input py-1.5">
                        {offered.filter((p) => grantablePlan(plans, p.id, r.plan, r.current)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                    <button className="btn-lime btn-sm">Approve</button>
                  </div>
                  <input name="note" maxLength={500} placeholder="Optional note in their email" className="input" />
                </form>
                <form action={declinePlanRequest.bind(null, r.id)} className="space-y-2">
                  <label className="block space-y-1.5">
                    <span className="label">Or decline, with a reason (sent to them)</span>
                    <input name="reason" required maxLength={500} placeholder="e.g. Free fits your volume for now" className="input" />
                  </label>
                  <ConfirmSubmit message={`Decline @${r.handle}'s request? They're emailed the reason.`} className="btn-sm rounded-md border border-danger/50 px-4 text-danger hover:bg-danger/10">
                    Decline
                  </ConfirmSubmit>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="recent-h" className="space-y-3">
          <h2 id="recent-h" className="text-lg font-semibold">Recently decided</h2>
          <ul className="divide-y divide-line rounded-md border border-line text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span>
                  @{r.handle} <span className="text-mute">· {kindLabel(r.kind)} · asked for {nameOf(r.plan)}</span>
                </span>
                <span className={r.status === "approved" ? "text-lime" : "text-mute"}>
                  {r.status === "approved" ? `Given ${nameOf(r.granted_plan)}` : "Declined"} · {r.decided_at ? when(r.decided_at) : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
