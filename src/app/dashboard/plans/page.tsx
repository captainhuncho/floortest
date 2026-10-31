import { trackUse } from "@/lib/usage";
import { teamsOn } from "@/lib/account-members";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { capacity } from "@/lib/desk";
import { RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";
import { allPlans, planOf } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";
import { BillingSwitch } from "./BillingSwitch";
import { PlanCards } from "./PlanCards";
import { pendingRequest } from "@/lib/plan-requests";
import { CARD, Icon, PageHead, SectionHead } from "@/components/Kit";

export const metadata = { title: "Plans — FloorTest" };

/**
 * Usage, then the three plans side by side on desktop (stacked on phones). During the beta every plan
 * upgrades go through checkout, where the beta discount makes the total $0.00; once the billing switch is on, checkout charges.
 */
export default async function Plans({ searchParams }: { searchParams: Promise<{ welcome?: string; period?: string; requested?: string }> }) {
  const user = await requireRole("owner");
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
    <div id="plans-root" data-period={yearly ? "year" : "month"} className="page-gutter py-4 text-bone sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4 sm:gap-5 xl:max-w-6xl">
      <Link href="/dashboard/account" className="tap-text -my-2 w-fit text-[11.5px] font-medium text-faint hover:text-bone">
        ← Account
      </Link>
      <PageHead label="Same desk. Pick the room you need." title="Choose your plan">
        <BillingSwitch initial={yearly ? "year" : "month"} target="plans-root" />
      </PageHead>

      {sp.requested && pending && (
        <p role="status" className={`${CARD} flex items-start gap-2.5 p-3 text-[13px] leading-5`}>
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-lime" />
          Request sent. We&apos;ll look at it and email you, usually within two working days.
        </p>
      )}

      {welcomed && (
        <div role="status" className={`${CARD} flex items-start gap-3 border-lime/40 p-3 sm:p-4`}>
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-lime text-ink">
            <Icon name="check" className="size-[18px]" />
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.015em]">You&apos;re on {current.name} now.</p>
            <p className="mt-0.5 text-[12.5px] leading-5 text-mute">
              Room for {current.limit.toLocaleString("en")} active tracks{current.seats > 1 && (await teamsOn(user.id)) ? `, and ${current.seats} people on the account` : ""}.{" "}
              {billing ? "Thanks for upgrading." : "Free for the rest of the beta."}
            </p>
          </div>
        </div>
      )}

      <section aria-labelledby="usage-h" className={`${CARD} flex flex-col gap-2.5 p-3 sm:p-4`}>
        <SectionHead id="usage-h" icon="card" title={`${current.name} plan · ${cap.used} of ${cap.limit.toLocaleString("en")} tracks`} aside={<span className="tnum">{pct}% used</span>} />
        <div className="h-1.5 overflow-hidden rounded-full bg-line-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Tracks used">
          <div className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11.5px] leading-[1.5] text-faint">
          Active tracks: everything on your desk. Undecided tracks leave after {RETAIN_UNREVIEWED_DAYS} days, Not for me after{" "}
          {RETAIN_PASSED_DAYS}, kept tracks when you delete them. Deleting frees the slot at once.
          {cap.bonus > 0 && ` Includes ${cap.bonus} extra slots from referrals.`}
        </p>
      </section>

      <PlanCards requests={await switchOn("plan_requests", user)} teams={await teamsOn(user.id)} plans={plans} billing={billing} userPlan={user.plan} currentPrice={current.price} capUsed={cap.used} capBonus={cap.bonus} pendingPlan={pending?.plan ?? null} sharing={sharing} />

      <section aria-labelledby="renewal-h" className={`${CARD} flex flex-col gap-1.5 p-3 text-[11.5px] leading-[1.5] text-faint sm:p-4`}>
        <h2 id="renewal-h" className="text-[12.5px] font-semibold text-bone">
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
    </div>
  );
}
