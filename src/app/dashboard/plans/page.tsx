import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { capacity } from "@/lib/core";
import { PLAN_FEATURES, PLANS, RETAIN_UNREVIEWED_DAYS, planOf, type PlanId } from "@/lib/plans";
import { switchOn } from "@/lib/switches";
import { setPlan } from "../actions";

export const metadata = { title: "Plans — FloorTest" };

/**
 * Usage, then the three plans side by side on desktop (stacked on phones). During the beta every plan
 * upgrades go through checkout, where the beta discount makes the total $0.00; once the billing switch is on, checkout charges.
 */
export default async function Plans({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  await trackUse(user.id, "plans");
  const cap = await capacity(user);
  const current = planOf(user.plan);
  // Just upgraded at checkout: celebrate it, but only if the plan really is theirs now.
  const welcomed = (await searchParams).welcome === user.plan && current.price > 0;
  const billing = await switchOn("billing");
  const pct = Math.min(100, Math.round((cap.used / Math.max(1, cap.limit)) * 100));
  const ids = Object.keys(PLANS) as PlanId[];
  const rank = (p: string) => ids.indexOf(p as PlanId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-5 text-bone sm:px-8 md:py-8">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard/account" className="text-[11px] font-medium text-faint hover:text-bone">
          ← Account
        </Link>
        <h1 className="text-[28px] font-bold tracking-[-0.8px] md:text-[32px]">Plans</h1>
        <p className="text-sm text-mute">{billing ? "Pick the plan that fits your inbox." : "Every plan is free during the beta: the beta discount takes checkout to $0.00."}</p>
      </div>

      {welcomed && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-lime/50 bg-lime/10 p-4 md:p-5">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-lime text-[15px] font-bold text-ink">
            ✓
          </span>
          <div>
            <p className="text-[15px] font-bold">You&apos;re on {current.name} now.</p>
            <p className="mt-0.5 text-[13px] text-mute">
              Room for {current.limit.toLocaleString("en")} active tracks{user.plan === "team" ? ", and you can add teammates to any collection" : ""}.{" "}
              {billing ? "Thanks for upgrading." : "Free for the rest of the beta."}
            </p>
          </div>
        </div>
      )}

      <section aria-labelledby="usage-h" className="rounded-xl border border-line bg-ink-2 p-4 md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="usage-h" className="text-[13px] font-bold">
            {current.name} plan · {cap.used} of {cap.limit.toLocaleString("en")} tracks
          </h2>
          <span className="text-[11px] text-mute tnum">{pct}% used</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Tracks used">
          <div className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-dim">
          Undecided tracks are deleted after {RETAIN_UNREVIEWED_DAYS} days; kept tracks stay until you delete them.
          {cap.bonus > 0 && ` Includes ${cap.bonus} extra slots from referrals.`}
        </p>
      </section>

      <ul className="grid gap-3 md:grid-cols-3 md:gap-4">
        {ids.map((id) => {
          const p = PLANS[id];
          const isCurrent = user.plan === id;
          const tooSmall = cap.used > p.limit + cap.bonus;
          const upgrade = rank(id) > rank(user.plan);
          const featured = id === "pro";
          return (
            <li
              key={id}
              className={`flex flex-col rounded-xl border p-4 md:p-5 ${featured ? "border-lime/50 bg-ink-2" : "border-line bg-ink-2"}`}
              aria-current={isCurrent ? "true" : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold">{p.name}</h2>
                {isCurrent ? (
                  <span className="rounded-full bg-bone px-2 py-0.5 text-[11px] font-bold text-ink">Your plan</span>
                ) : featured ? (
                  <span className="rounded-full border border-lime/50 px-2 py-0.5 text-[11px] font-bold text-lime">Recommended</span>
                ) : null}
              </div>
              <p className="mt-3 text-[28px] font-bold tnum">
                {p.price ? `$${p.price}` : "$0"}
                <span className="ml-1 text-[12px] font-normal text-mute">{p.price ? "/ month" : "for good"}</span>
              </p>
              {!billing && p.price > 0 && <p className="text-[11px] text-lime">Free during the beta</p>}
              <p className="mt-1 text-[12px] text-mute">{p.blurb}</p>
              <ul className="mt-4 flex-1 space-y-1.5 text-[13px]">
                {PLAN_FEATURES[id].map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="text-lime">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  <p className="text-center text-[12px] text-mute">You&apos;re on this plan</p>
                ) : tooSmall ? (
                  <p className="text-center text-[12px] text-mute">You have more tracks than this plan holds</p>
                ) : upgrade ? (
                  <Link href={`/dashboard/checkout?plan=${id}`} className="btn-lime w-full">
                    Upgrade to {p.name}
                  </Link>
                ) : (
                  <form action={setPlan.bind(null, id)}>
                    <button className="btn-ghost w-full">Move to {p.name}</button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="renewal-h" className="space-y-1.5 text-[11px] text-dim md:max-w-3xl">
        <h2 id="renewal-h" className="font-bold text-mute">
          Renewal and billing
        </h2>
        {billing ? (
          <p>
            Paid plans are billed monthly and renew automatically until you cancel. You can cancel any time from this page; you keep the plan until the end of
            the month you&apos;ve paid for. Full terms are shown before you pay.
          </p>
        ) : (
          <>
            <p>All plans are free during the beta. We don&apos;t take a card, so nothing renews and nothing is charged.</p>
            <p>
              Free Pro and Team during the beta is a temporary trial, not a gift or a lifetime plan. It has no cash value, can&apos;t be transferred, and ends
              when paid plans start. Referral bonuses work the same way.
            </p>
            <p>
              Before paid plans start, everyone on Pro or Team gets at least 30 days&apos; notice by email with the price. You&apos;re only charged if you
              choose to continue; otherwise you move to Free and keep every track you already have.
            </p>
          </>
        )}
        <p>
          Free stays free. See the{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-bone">
            Terms of Use
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
