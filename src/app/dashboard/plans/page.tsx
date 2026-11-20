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
import { PlanCompare } from "./PlanCompare";
import { PlansIntro } from "./PlansIntro";
import { PlanPick } from "./PlanPick";
import { firstPick, pickRows } from "./pick-rows";
import { bestSaving, hasYearly } from "./plan-lines";
import { pendingRequest } from "@/lib/plan-requests";
import { CARD, Icon } from "@/components/Kit";

export const metadata = { title: "Plans — FloorTest" };

/**
 * A centred intro with the Monthly / Yearly switch (only when plans have yearly prices), usage in one card, then the
 * plans: on phones a pick list with one button for the picked plan, on wider screens the cards side by side. Then
 * "Compare every plan" (the table, opened on tap) and the renewal notes. During the beta bigger plans are given on
 * request (switch `plan_requests`) or set by FloorTest; once the billing switch is on, upgrades go through checkout.
 */
export default async function Plans({ searchParams }: { searchParams: Promise<{ welcome?: string; period?: string; requested?: string }> }) {
  const user = await requireRole("owner");
  await trackUse(user.id, "plans");
  const cap = await capacity(user);
  const current = await planOf(user.plan);
  // Just upgraded at checkout: celebrate it, but only if the plan really is theirs now.
  const sp = await searchParams;
  const welcomed = sp.welcome === user.plan && current.price > 0;
  const pending = await pendingRequest(user.id, user.actor_id);
  const [billing, sharing] = await Promise.all([switchOn("billing"), switchOn("sharing")]);
  const pct = Math.min(100, Math.round((cap.used / Math.max(1, cap.limit)) * 100));
  // Offered plans, plus the person's own plan even if it's been retired (they keep it until they change).
  const plans = (await allPlans()).filter((p) => !p.retired || p.id === user.plan);

  const live = { sharing, teams: await teamsOn(user.id) };
  // The Yearly view only exists when plans have yearly prices; a plan without one says so rather than guessing.
  const yearly = sp.period === "year" && hasYearly(plans);
  const save = bestSaving(plans);
  const requests = await switchOn("plan_requests", user);
  const rows = pickRows(plans, {
    billing,
    requests,
    userPlan: user.plan,
    currentPrice: current.price,
    capUsed: cap.used,
    capBonus: cap.bonus,
    pendingPlan: pending?.plan ?? null,
    live,
    yearly: hasYearly(plans),
  });

  return (
    <div id="plans-root" data-period={yearly ? "year" : "month"} className="page-gutter py-4 text-bone sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-[1040px] flex-col gap-5 sm:gap-7">
      <Link href="/dashboard/settings" className="tap-text -my-2 w-fit text-[11.5px] font-medium text-faint hover:text-bone">
        ‹ Settings
      </Link>
      <PlansIntro billing={billing} title="Choose your plan" sub="Same desk. Pick the room you need.">
        {hasYearly(plans) && (
          <>
            <BillingSwitch initial={yearly ? "year" : "month"} target="plans-root" />
            {save > 0 && <p className="text-[12px] text-faint">Yearly saves up to {save}%</p>}
          </>
        )}
      </PlansIntro>

      {sp.requested && pending && (
        <p role="status" className={`${CARD} mx-auto flex w-full max-w-3xl items-start gap-2.5 p-3 text-[13px] leading-5`}>
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-lime" />
          Request sent. We&apos;ll look at it and email you, usually within two working days.
        </p>
      )}

      {welcomed && (
        <div role="status" className={`${CARD} mx-auto flex w-full max-w-3xl items-start gap-3 border-lime/40 p-3 sm:p-4`}>
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-lime text-ink">
            <Icon name="check" className="size-[18px]" />
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.015em]">You&apos;re on {current.name} now.</p>
            <p className="mt-0.5 text-[12.5px] leading-5 text-mute">
              Room for {current.limit.toLocaleString("en")} active tracks{current.seats > 1 && live.teams ? `, and ${current.seats} people on the account` : ""}.{" "}
              {billing ? "Thanks for upgrading." : "Free for the rest of the beta."}
            </p>
          </div>
        </div>
      )}

      <section aria-labelledby="usage-h" className={`${CARD} flex w-full flex-col gap-2.5 p-4`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="usage-h" className="text-[14px] font-semibold text-bone">
            {current.name} plan · {cap.used} of {cap.limit.toLocaleString("en")} tracks
          </h2>
          <span className="shrink-0 text-[12.5px] text-mute tnum">{pct}% used</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Tracks used">
          <div className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[12px] leading-[1.5] text-faint">
          Active tracks: everything on your desk. Undecided tracks leave after {RETAIN_UNREVIEWED_DAYS} days, Not for me after{" "}
          {RETAIN_PASSED_DAYS}, kept tracks when you delete them. Deleting frees the slot at once.
          {cap.bonus > 0 && ` Includes ${cap.bonus} extra slots from referrals.`}
        </p>
      </section>

      <div className="md:hidden">
        <PlanPick
          rows={rows}
          initial={firstPick(plans, user.plan, current.price)}
          note={!billing && requests ? "Free for the rest of the beta. We look at requests within two working days." : undefined}
        />
      </div>
      <div className="hidden flex-col gap-5 md:flex">
        <PlanCards quiet note={false} requests={requests} teams={live.teams} plans={plans} billing={billing} userPlan={user.plan} currentPrice={current.price} capUsed={cap.used} capBonus={cap.bonus} pendingPlan={pending?.plan ?? null} sharing={sharing} />
      </div>

      {/* The full table stays one tap away; closed by default so the plans themselves come first. */}
      <details className="group">
        <summary className="tap-text mx-auto flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 text-[13.5px] font-medium text-bone underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
          Compare every plan
          <Icon name="down" className="size-4 text-mute transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="mt-3">
          <PlanCompare plans={plans} billing={billing} prices live={live} userPlan={user.plan} note={billing ? undefined : "Prices apply after the beta."} />
        </div>
      </details>

      <section aria-labelledby="renewal-h" className={`${CARD} flex w-full flex-col gap-1.5 p-4 text-[12px] leading-[1.5] text-faint sm:p-4`}>
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
