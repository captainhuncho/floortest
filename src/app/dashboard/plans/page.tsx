import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { capacity } from "@/lib/desk";
import { RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";
import { allPlans, planOf } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";
import { BillingSwitch } from "./BillingSwitch";
import { PlanCards } from "./PlanCards";
import { pendingRequest } from "@/lib/plan-requests";

export const metadata = { title: "Plans — FloorTest" };

/**
 * Usage, then the three plans side by side on desktop (stacked on phones). During the beta every plan
 * upgrades go through checkout, where the beta discount makes the total $0.00; once the billing switch is on, checkout charges.
 */
export default async function Plans({ searchParams }: { searchParams: Promise<{ welcome?: string; period?: string; requested?: string }> }) {
  const user = await requireUser();
  await trackUse(user.id, "plans");
  const cap = await capacity(user);
  const current = await planOf(user.plan);
  // Just upgraded at checkout: celebrate it, but only if the plan really is theirs now.
  const sp = await searchParams;
  const welcomed = sp.welcome === user.plan && current.price > 0;
  const pending = await pendingRequest(user.id);
  // Monthly prices are set; yearly ones aren't yet, so the Year view says so rather than guessing.
  const yearly = sp.period === "year";
  const [billing, sharing] = await Promise.all([switchOn("billing"), switchOn("sharing")]);
  const pct = Math.min(100, Math.round((cap.used / Math.max(1, cap.limit)) * 100));
  // Offered plans, plus the person's own plan even if it's been retired (they keep it until they change).
  const plans = (await allPlans()).filter((p) => !p.retired || p.id === user.plan);

  return (
    <div id="plans-root" data-period={yearly ? "year" : "month"} className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-5 text-bone sm:px-8 md:py-8">
      <Link href="/dashboard/account" className="text-[11px] font-medium text-faint hover:text-bone">
        ← Account
      </Link>
      <header className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone">Choose your plan</h1>
        <p className="text-[15px] text-mute">The same receiving desk. The capacity that fits your music.</p>
        <BillingSwitch initial={yearly ? "year" : "month"} target="plans-root" />
      </header>

      {sp.requested && pending && (
        <p role="status" className="rounded-lg border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          Request sent. We&apos;ll look at it and email you, usually within two working days.
        </p>
      )}

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

      <section aria-labelledby="usage-h" className="rounded-lg border border-line bg-ink-2 p-4 md:p-5">
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
          Active tracks are everything on your desk: waiting, kept and not for me. Undecided tracks leave after {RETAIN_UNREVIEWED_DAYS} days, not for me after{" "}
          {RETAIN_PASSED_DAYS}, and kept tracks stay until you delete them. Deleting a track frees its slot at once.
          {cap.bonus > 0 && ` Includes ${cap.bonus} extra slots from referrals.`}
        </p>
      </section>

      <PlanCards plans={plans} billing={billing} userPlan={user.plan} currentPrice={current.price} capUsed={cap.used} capBonus={cap.bonus} pendingPlan={pending?.plan ?? null} sharing={sharing} />

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
