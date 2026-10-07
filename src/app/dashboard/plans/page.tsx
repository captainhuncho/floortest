import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { capacity } from "@/lib/desk";
import { RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";
import { allPlans, planGrid, planOf } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";
import { setPlan } from "../actions/settings";

export const metadata = { title: "Plans — FloorTest" };

/** The core tools every plan gets; plans differ in room (and, on paid plans, a few extras). */
const SHARED = ["Permanent receiving link", "Private track submissions", "Listen and review", "Receipts and updates for senders", "Organise collections", "Prepare for your set", "Download tracks"];

/**
 * Usage, then the three plans side by side on desktop (stacked on phones). During the beta every plan
 * upgrades go through checkout, where the beta discount makes the total $0.00; once the billing switch is on, checkout charges.
 */
export default async function Plans({ searchParams }: { searchParams: Promise<{ welcome?: string; period?: string }> }) {
  const user = await requireUser();
  await trackUse(user.id, "plans");
  const cap = await capacity(user);
  const current = await planOf(user.plan);
  // Just upgraded at checkout: celebrate it, but only if the plan really is theirs now.
  const sp = await searchParams;
  const welcomed = sp.welcome === user.plan && current.price > 0;
  // Monthly prices are set; yearly ones aren't yet, so the Year view says so rather than guessing.
  const yearly = sp.period === "year";
  const billing = await switchOn("billing");
  const pct = Math.min(100, Math.round((cap.used / Math.max(1, cap.limit)) * 100));
  // Offered plans, plus the person's own plan even if it's been retired (they keep it until they change).
  const plans = (await allPlans()).filter((p) => !p.retired || p.id === user.plan);
  // Paid plans' own extras, minus lines the card already shows (capacity) or that only point at another plan.
  const extrasOf = (p: (typeof plans)[number]) => (p.price > 0 ? p.features.filter((f) => !/active tracks|^everything in/i.test(f)) : []);
  const sameTools = plans.every((p) => !extrasOf(p).length);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-5 text-bone sm:px-8 md:py-8">
      <Link href="/dashboard/account" className="text-[11px] font-medium text-faint hover:text-bone">
        ← Account
      </Link>
      <header className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-[28px] tracking-[-0.5px] md:text-[36px]">Choose your plan</h1>
        <p className="text-[15px] text-mute">The same receiving desk. The capacity that fits your music.</p>
        <nav aria-label="Billing period" className="flex gap-1 rounded-full border border-line bg-ink-2 p-1">
          {(["year", "month"] as const).map((per) => {
            const on = (per === "year") === yearly;
            return (
              <Link
                key={per}
                href={per === "year" ? "/dashboard/plans?period=year" : "/dashboard/plans"}
                aria-current={on ? "page" : undefined}
                className={`grid h-[34px] w-[88px] place-items-center rounded-full text-[13px] font-semibold ${on ? "bg-ink-3 text-lime" : "text-mute hover:text-bone"}`}
              >
                {per === "year" ? "Year" : "Month"}
              </Link>
            );
          })}
        </nav>
      </header>

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
          Undecided tracks are deleted after {RETAIN_UNREVIEWED_DAYS} days; kept tracks stay until you delete them.
          {cap.bonus > 0 && ` Includes ${cap.bonus} extra slots from referrals.`}
        </p>
      </section>

      {!billing && (
        <p className="flex items-center gap-2.5 rounded-lg border border-line bg-ink-2 px-[18px] py-3.5 text-sm font-medium">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-lime" />
          Free during beta. Paid plans start after it ends.
        </p>
      )}

      <ul className={`grid gap-4 ${planGrid(plans.length)}`}>
        {plans.map((p) => {
          const id = p.id;
          const isCurrent = user.plan === id;
          const tooSmall = cap.used > p.limit + cap.bonus;
          const upgrade = p.price > current.price;
          const featured = p.featured;
          const extras = extrasOf(p);
          const action = billing ? `Upgrade to ${p.name}` : "Start in beta →";
          return (
            <li
              key={id}
              className={`flex flex-col gap-4 rounded-[14px] border p-6 md:p-7 ${featured ? "border-[#6c7e38] bg-[#20251a]" : "border-line bg-ink-2"}`}
              aria-current={isCurrent ? "true" : undefined}
            >
              <div className="flex min-h-[30px] items-center justify-between gap-2">
                <h2 className="text-2xl font-semibold">{p.name}</h2>
                {isCurrent ? (
                  <span className="rounded-full bg-bone px-2.5 py-1 text-[11px] font-semibold text-ink">Your plan</span>
                ) : featured ? (
                  <span className="rounded-full border border-[#6c7e38] px-2.5 py-1 text-[11px] font-semibold text-lime">More room</span>
                ) : null}
              </div>

              <div className="flex min-h-[78px] flex-col gap-1">
                <p className="flex items-baseline gap-2">
                  {p.price && yearly ? (
                    <span className="text-[22px] font-semibold leading-[54px] whitespace-nowrap">To be confirmed</span>
                  ) : (
                    <span className="text-5xl font-semibold leading-[54px] tnum">${p.price ? p.price : 0}</span>
                  )}
                  {p.price > 0 && !yearly && <span className="text-sm text-mute">/ month</span>}
                </p>
                <p className="text-xs text-mute">{!p.price ? "Free plan" : yearly ? "Yearly price, after beta" : billing ? p.blurb : "After beta"}</p>
              </div>

              <div>
                {isCurrent ? (
                  <p className="grid h-11 place-items-center rounded-lg border border-line text-[13px] font-semibold text-mute">You&apos;re on this plan</p>
                ) : tooSmall ? (
                  <p className="grid min-h-11 place-items-center rounded-lg border border-line px-3 text-center text-[12px] text-mute">You have more tracks than this plan holds</p>
                ) : upgrade ? (
                  <Link
                    href={`/dashboard/checkout?plan=${id}`}
                    className={`grid h-11 place-items-center rounded-lg border text-[13px] font-semibold ${featured ? "border-lime bg-lime text-ink hover:brightness-95" : "border-[#64675c] text-bone hover:border-bone"}`}
                  >
                    {action}
                  </Link>
                ) : (
                  <form action={setPlan.bind(null, id)}>
                    <button className="h-11 w-full rounded-lg border border-[#64675c] text-[13px] font-semibold text-bone hover:border-bone">Move to {p.name}</button>
                  </form>
                )}
              </div>

              <p className={`flex items-baseline gap-2 border-b pb-4 ${featured ? "border-[#6c7e38]" : "border-line"}`}>
                <span className="text-[21px] font-semibold tnum">{p.limit.toLocaleString("en")}</span>
                <span className="text-sm text-mute">active tracks</span>
              </p>

              <div className="flex flex-col gap-3.5">
                <p className="text-xs font-semibold text-mute">Included in every plan</p>
                <ul className="flex flex-col gap-2.5 text-sm">
                  {SHARED.map((f) => (
                    <li key={f} className="flex items-center gap-2.5">
                      <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-lime" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5l3.2 3L13 4.5" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                {extras.length > 0 && (
                  <>
                    <p className="pt-1 text-xs font-semibold text-mute">Also on {p.name}</p>
                    <ul className="flex flex-col gap-2.5 text-sm">
                      {extras.map((f) => (
                        <li key={f} className="flex items-center gap-2.5">
                          <span aria-hidden className="grid size-4 shrink-0 place-items-center text-lime">+</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1 text-xs text-mute sm:flex-row sm:justify-between">
        <p>{sameTools ? "All plans include the same tools. Only active-track capacity changes." : "Every plan includes the core tools; bigger plans add room and a few extras."}</p>
        <p>{yearly ? "Yearly pricing is not yet confirmed." : billing ? "Billed monthly." : "Prices shown apply after beta."}</p>
      </div>

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
