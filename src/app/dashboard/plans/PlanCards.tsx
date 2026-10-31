import Link from "next/link";
import { fmtBytes } from "@/lib/format";
import { afterDiscount, discountNow, planGrid, type Plan } from "@/lib/plan-store";
import { setPlan } from "../actions/settings";
import { CARD, Chip, Icon } from "@/components/Kit";

/** The core tools every plan gets; plans differ in room (and, on paid plans, a few extras). */
const SHARED = ["Permanent receiving link", "Private uploads, no sender account needed", "Listen and review", "Receipts and updates for senders", "Organise collections", "Prepare for your set", "Download tracks"];

/**
 * The plan cards, notes and beta strip, shared by the plans page and the ops preview. In `preview` the buttons look
 * real but do nothing, and nobody is "on" a plan.
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
}) {
  /*
   * What a paid plan adds, read from what it actually enables (folders, artwork, colleague downloads) so the card can't
   * drift from the product. Ops' own feature lines follow, minus capacity (shown above), "everything in" pointers and
   * anything about features that are held (sharing, stems) while they're off.
   */
  const extrasOf = (p: Plan) => {
    if (p.price <= 0) return [];
    const live = [
      p.folderBytes > 0 && `Send folders (EP or album) up to ${fmtBytes(p.folderBytes)}`,
      p.trackArt && "Track artwork from senders",
      teams && p.seats > 1 && `${p.seats} people on one account (you + ${p.seats - 1}), each with their own login; extra seats available`,
    ].filter((f): f is string => !!f);
    const held = sharing ? /stems|as they launch/i : /colleague|share|teammate|stems|as they launch/i;
    const own = p.features.filter((f) => !/active tracks|^everything in/i.test(f) && !held.test(f) && !live.some((l) => l.toLowerCase() === f.toLowerCase()));
    return [...live, ...own];
  };
  const sameTools = plans.every((p) => !extrasOf(p).length);
  // Yearly against twelve months, rounded down so we never overstate it.
  const saving = (p: Plan) => (p.price && p.yearly ? Math.max(0, Math.floor((1 - p.yearly / (p.price * 12)) * 100)) : 0);
  const yearlyUnset = plans.some((p) => p.price > 0 && !p.yearly);
  return (
    <>
      {!billing && (
        <p className="flex items-center gap-2.5 px-1 text-[12.5px] font-medium text-mute">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-lime" />
          Free during beta. Paid plans start after it ends.
        </p>
      )}

      <ul className={`grid gap-4 sm:gap-5 ${planGrid(plans.length)}`}>
        {plans.map((p, i) => {
          const id = p.id;
          const isCurrent = userPlan === id;
          const tooSmall = !preview && capUsed > p.limit + capBonus;
          const upgrade = p.price > currentPrice;
          const featured = p.featured;
          const extras = extrasOf(p);
          // A running discount shows the list price struck through; list prices themselves never change. While plans are
          // free (billing off) no price applies yet, so no offer is shown either.
          const off = billing ? discountNow(p) : 0;
          // One price size for both periods, so switching doesn't resize the number.
          const bigPrice = !!off || Math.max(p.price, p.yearly) >= 100;
          const action = billing ? `Upgrade to ${p.name}` : `Request ${p.name} →`;
          return (
            <li
              key={id}
              className={`${CARD} flex flex-col gap-3.5 p-4 sm:p-5 ${featured ? "border-lime/40" : ""}`}
              aria-current={isCurrent ? "true" : undefined}
            >
              <div className="flex min-h-[30px] items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold tracking-[-0.015em]">{p.name}</h2>
                {isCurrent ? <Chip tone="up">Your plan</Chip> : featured ? <Chip tone="acc">More room</Chip> : null}
              </div>

              {/* Month and year sit in the same spot and cross-fade, so the card never changes size. */}
              <div className="period-stack">
              {([false, true] as const).map((yr) => {
                const list = yr ? p.yearly : p.price;
                const shown = off && list ? afterDiscount(list, off) : list;
                return (
                  <div key={String(yr)} className={`${yr ? "period-year" : "period-month"} flex min-h-[68px] flex-col gap-1`}>
                    {off > 0 && (
                      <p className="w-fit">
                        <Chip tone="acc">
                          {p.discount.label || "Offer"} · {off}% off{p.discount.endsAt ? ` · until ${new Date(p.discount.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}
                        </Chip>
                      </p>
                    )}
                    <p className="flex items-baseline gap-2 whitespace-nowrap">
                      {p.price && yr && !p.yearly ? (
                        <span className="text-[20px] font-semibold leading-[46px] whitespace-nowrap">To be confirmed</span>
                      ) : (
                        <>
                          <span className={`${bigPrice ? "text-[32px]" : "text-[38px]"} font-semibold leading-[46px] tracking-[-0.035em] tnum`}>${p.price ? shown : 0}</span>
                          {off > 0 && list > 0 && <s className="text-sm text-mute tnum">${list}</s>}
                        </>
                      )}
                      {p.price > 0 && (!yr || p.yearly > 0) && <span className="text-[12px] text-mute">/ {yr ? "year" : "month"}</span>}
                    </p>
                    <p className="text-[11.5px] text-mute">{!p.price ? "Free plan" : yr ? (p.yearly ? `${billing ? "Billed yearly" : "After beta"}${saving(p) ? ` · save ${saving(p)}%` : ""}` : "Yearly price, after beta") : billing ? p.blurb : "After beta"}</p>
                  </div>
                );
              })}
              </div>

              <div>
                {preview ? (
                  <span aria-hidden className={`grid h-11 place-items-center rounded-[13px] border text-[13px] font-semibold ${featured ? "border-lime bg-lime text-ink" : "border-line bg-well text-bone"}`}>
                    {p.price ? action : "Start free"}
                  </span>
                ) : isCurrent ? (
                  <p className="grid h-11 place-items-center rounded-[13px] border border-dashed border-line-2 text-[12.5px] font-semibold text-mute">You&apos;re on this plan</p>
                ) : tooSmall ? (
                  <p className="grid min-h-11 place-items-center rounded-[13px] border border-dashed border-line-2 px-3 text-center text-[12px] text-mute">You have more tracks than this plan holds</p>
                ) : upgrade && !billing && !requests ? (
                  <p className="grid min-h-11 place-items-center rounded-[13px] border border-dashed border-line-2 px-3 text-center text-[12px] text-mute">Set by FloorTest during the beta</p>
                ) : upgrade && !billing && pendingPlan === id ? (
                  <Link href={`/dashboard/plans/request?plan=${id}`} className="grid h-11 place-items-center rounded-[13px] border border-lime/40 bg-lime/10 text-[13px] font-semibold text-lime">
                    Requested · in review
                  </Link>
                ) : upgrade ? (
                  <Link
                    href={billing ? `/dashboard/checkout?plan=${id}` : `/dashboard/plans/request?plan=${id}`}
                    className={`grid h-11 place-items-center rounded-[13px] border text-[13px] font-semibold ${featured ? "border-lime bg-lime text-ink hover:brightness-95" : "border-line bg-well text-bone hover:border-line-2"}`}
                  >
                    {action}
                  </Link>
                ) : (
                  <form action={setPlan.bind(null, id)}>
                    <button className="h-11 w-full rounded-[13px] border border-line bg-well text-[13px] font-semibold text-bone hover:border-line-2">Move to {p.name}</button>
                  </form>
                )}
              </div>

              <p className="flex items-baseline gap-2 border-b border-dashed border-line-2 pb-3.5">
                <span className="text-[19px] font-semibold tracking-[-0.02em] tnum">{p.limit.toLocaleString("en")}</span>
                <span className="text-[12.5px] text-mute">active tracks</span>
              </p>

              <div className="flex flex-col gap-3">
                {/* The shared tools are listed once, on the first card; the others say what they add. */}
                <p className="text-[11.5px] font-semibold text-mute">{i === 0 ? "Included in every plan" : `Everything in ${plans[0].name}${extras.length ? ", plus" : ""}`}</p>
                <ul className={`flex flex-col gap-2 text-[13px] leading-5 ${i === 0 ? "" : "hidden"}`}>
                  {SHARED.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Icon name="check" className="mt-0.5 size-4 text-mute" />
                      {f}
                    </li>
                  ))}
                </ul>
                {extras.length > 0 && (
                  <>
                    <ul className="flex flex-col gap-2 text-[13px] leading-5">
                      {extras.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Icon name="plus" className="mt-0.5 size-4 text-mute" />
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

      <div className="flex flex-col gap-1 px-1 text-[11.5px] text-faint sm:flex-row sm:justify-between">
        <p>{sameTools ? "Only active-track room changes between plans." : ""}</p>
        <div className="period-stack sm:text-right">
          <p className="period-month">{billing ? "Billed monthly." : ""}</p>
          <p className="period-year">{yearlyUnset ? "Yearly pricing is not yet confirmed for every plan." : billing ? "Billed yearly." : ""}</p>
        </div>
      </div>
    </>
  );
}
