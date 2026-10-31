import Link from "next/link";
import { afterDiscount, discountNow, planGrid, type Plan } from "@/lib/plan-store";
import { setPlan } from "../actions/settings";
import { CARD, Chip, Icon } from "@/components/Kit";
import { addsOver, extrasOf, liftedId, saving, SHARED } from "./plan-lines";

/** The quiet button every card but the lifted one gets; the lifted card's action is the page's one lime button. */
const QUIET = "border-line bg-well text-bone hover:border-line-2";
const LIME = "border-lime bg-lime text-ink hover:brightness-95";
const SLOT = "grid min-h-11 place-items-center rounded-[13px] border px-3 text-center text-[13px] font-semibold";
const NOTE = "grid min-h-11 place-items-center rounded-[13px] border border-dashed border-line-2 px-3 text-center text-[12px] text-mute";

/**
 * The plan cards, shared by the plans page, the public pricing page and the ops preview. Equal-height cards side by
 * side (stacked on phones); the featured plan (or the first) is lifted and carries the one lime button. Each card:
 * name, who it's for, the price, the room it gives, one action, then what it adds over the plan before it.
 *
 * In `preview` the buttons look real but do nothing and nobody is "on" a plan. With `publicCta` (the pricing page)
 * every card links to sign-up or the desk; with `freeInBeta` it shows "Free" instead of prices while billing is off.
 */
export function PlanCards({
  plans,
  billing,
  userPlan,
  currentPrice,
  capUsed = 0,
  capBonus = 0,
  preview = false,
  pendingPlan = null,
  sharing = false,
  requests = true,
  teams = false,
  publicCta,
  freeInBeta = false,
  note = true,
}: {
  plans: Plan[];
  billing: boolean;
  userPlan: string | null;
  currentPrice: number;
  capUsed?: number;
  capBonus?: number;
  preview?: boolean;
  /** During the beta: the plan this person has asked for and is waiting on. */
  pendingPlan?: string | null;
  /** Colleague sharing is live (switch `sharing`); until then nothing about it is promised. */
  sharing?: boolean;
  /** Plan requests are open (switch `plan_requests`); off in the beta, when FloorTest sets plans from ops. */
  requests?: boolean;
  /** Account teams are live (switch `teams`): show each plan's seats. */
  teams?: boolean;
  /** The pricing page: every card's action is this link (sign up, open the desk or join the waitlist). */
  publicCta?: { href: string; label: string };
  /** The pricing page while billing is off: every plan reads "Free" rather than a price that doesn't apply yet. */
  freeInBeta?: boolean;
  /** The "Free during beta" line above the cards (pages that say it in their own intro turn it off). */
  note?: boolean;
}) {
  const live = { sharing, teams };
  const sameTools = plans.every((p) => !extrasOf(p, live).length);
  const yearlyUnset = plans.some((p) => p.price > 0 && !p.yearly);
  const lift = liftedId(plans);
  return (
    <>
      {note && !billing && (
        <p className="flex items-center gap-2.5 px-1 text-[12.5px] font-medium text-mute">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-lime" />
          Free during beta. Paid plans start after it ends.
        </p>
      )}

      <ul className={`grid items-stretch gap-4 sm:gap-5 md:py-4 ${planGrid(plans.length)}`}>
        {plans.map((p, i) => {
          const id = p.id;
          const isCurrent = userPlan === id;
          const tooSmall = !preview && !publicCta && capUsed > p.limit + capBonus;
          const upgrade = p.price > currentPrice;
          const lifted = id === lift;
          const prev = plans[i - 1];
          const adds = addsOver(p, prev, live);
          // A running discount shows the list price struck through; list prices themselves never change. While plans are
          // free (billing off) no price applies yet, so no offer is shown either.
          const off = billing ? discountNow(p) : 0;
          const action = billing ? `Upgrade to ${p.name}` : `Request ${p.name}`;
          return (
            <li
              key={id}
              className={`${CARD} flex min-w-0 flex-col gap-4 p-5 sm:p-6 ${lifted ? "border-lime/60 md:-my-4 md:py-8" : ""}`}
              aria-current={isCurrent ? "true" : undefined}
            >
              <div className="flex min-h-[26px] items-center justify-between gap-2">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-bone">{p.name}</h2>
                {lifted && p.featured && <Chip tone="acc">Recommended</Chip>}
              </div>
              {p.blurb && <p className="-mt-2 text-[13px] leading-5 text-mute md:min-h-10">{p.blurb}</p>}

              {freeInBeta && !billing ? (
                <div className="flex min-h-[64px] flex-col justify-end gap-1">
                  <p className="flex items-baseline gap-2">
                    <span className="font-mono text-[40px] font-bold leading-[44px] tracking-[-0.04em]">Free</span>
                    <span className="text-[12px] text-mute">{p.price > 0 ? "during the beta" : "for good"}</span>
                  </p>
                </div>
              ) : (
                /* Month and year sit in the same spot and cross-fade, so the card never changes size. */
                <div className="period-stack">
                  {([false, true] as const).map((yr) => {
                    const list = yr ? p.yearly : p.price;
                    const shown = off && list ? afterDiscount(list, off) : list;
                    return (
                      <div key={String(yr)} className={`${yr ? "period-year" : "period-month"} flex min-h-[64px] flex-col justify-end gap-1`}>
                        {off > 0 && (
                          <p className="w-fit">
                            <Chip tone="acc">
                              {p.discount.label || "Offer"} · {off}% off
                              {p.discount.endsAt ? ` · until ${new Date(p.discount.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}
                            </Chip>
                          </p>
                        )}
                        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
                          {p.price && yr && !p.yearly ? (
                            <span className="text-[20px] font-semibold leading-[44px]">To be confirmed</span>
                          ) : (
                            <>
                              <span className={`font-mono ${Math.max(p.price, p.yearly) >= 100 || off ? "text-[34px]" : "text-[40px]"} font-bold leading-[44px] tracking-[-0.04em] tnum`}>
                                ${p.price ? shown : 0}
                              </span>
                              {off > 0 && list > 0 && <s className="text-sm text-mute tnum">${list}</s>}
                            </>
                          )}
                          {p.price > 0 && (!yr || p.yearly > 0) && <span className="text-[12px] text-mute">/ {yr ? "year" : "month"}</span>}
                        </p>
                        <p className="text-[11.5px] text-faint">
                          {!p.price
                            ? "Free for good"
                            : yr
                              ? p.yearly
                                ? `${billing ? "Billed yearly" : "After the beta"}${saving(p) ? `, save ${saving(p)}%` : ""}`
                                : "Yearly price, after the beta"
                              : billing
                                ? "Billed monthly"
                                : "After the beta"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* The room a plan gives is the difference that matters most, so it gets its own readout. */}
              <p className="flex items-baseline gap-2 rounded-[12px] border border-line bg-ink px-3.5 py-2.5">
                <span className="font-mono text-[19px] font-bold tracking-[-0.02em] text-bone tnum">{p.limit.toLocaleString("en")}</span>
                <span className="text-[12.5px] text-mute">active tracks</span>
              </p>

              <div>
                {publicCta ? (
                  <Link href={publicCta.href} className={`${SLOT} ${lifted ? LIME : QUIET}`}>
                    {publicCta.label}
                  </Link>
                ) : preview ? (
                  <span aria-hidden className={`${SLOT} ${lifted ? LIME : QUIET}`}>
                    {p.price ? action : "Start free"}
                  </span>
                ) : isCurrent ? (
                  <p className={`${SLOT} border-line-2 bg-transparent text-mute`}>
                    <span className="flex items-center gap-1.5">
                      <Icon name="tick" className="size-4" />
                      Your plan
                    </span>
                  </p>
                ) : tooSmall ? (
                  <p className={NOTE}>You have more tracks than this plan holds</p>
                ) : upgrade && !billing && !requests ? (
                  <p className={NOTE}>Set by FloorTest during the beta</p>
                ) : upgrade && !billing && pendingPlan === id ? (
                  <Link href={`/dashboard/plans/request?plan=${id}`} className={`${SLOT} border-lime/40 bg-lime/10 text-lime`}>
                    Requested, in review
                  </Link>
                ) : upgrade ? (
                  <Link href={billing ? `/dashboard/checkout?plan=${id}` : `/dashboard/plans/request?plan=${id}`} className={`${SLOT} ${lifted ? LIME : QUIET}`}>
                    {action}
                  </Link>
                ) : (
                  <form action={setPlan.bind(null, id)}>
                    <button className={`${SLOT} w-full ${QUIET}`}>Move to {p.name}</button>
                  </form>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-3 border-t border-line pt-4">
                {/* The shared tools are listed once, on the first card; the others say what they add over the one before. */}
                <p className="text-[12px] font-semibold text-mute">{i === 0 ? "Included in every plan:" : `Everything in ${prev.name}${adds.length ? ", plus:" : ""}`}</p>
                <ul className="flex flex-col gap-2.5 text-[13px] leading-5 text-bone">
                  {(i === 0 ? [...SHARED, ...adds] : adds).map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Icon name="tick" className="mt-0.5 size-4 text-mute" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1 px-1 text-[11.5px] text-faint sm:flex-row sm:justify-between">
        <p>{sameTools ? "Only active-track room changes between plans." : ""}</p>
        {!(freeInBeta && !billing) && (
          <div className="period-stack sm:text-right">
            <p className="period-month">{billing ? "Billed monthly." : ""}</p>
            <p className="period-year">{yearlyUnset ? "Yearly pricing is not yet confirmed for every plan." : billing ? "Billed yearly." : ""}</p>
          </div>
        )}
      </div>
    </>
  );
}
