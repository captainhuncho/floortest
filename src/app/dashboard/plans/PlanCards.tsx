import Link from "next/link";
import { fmtBytes } from "@/lib/format";
import { afterDiscount, discountNow, planGrid, type Plan } from "@/lib/plan-store";
import { setPlan } from "../actions/settings";

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
        <p className="flex items-center gap-2.5 rounded-lg border border-line bg-ink-2 px-[18px] py-3.5 text-sm font-medium">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-lime" />
          Free during beta. Paid plans start after it ends.
        </p>
      )}

      <ul className={`grid gap-4 ${planGrid(plans.length)}`}>
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
              className={`flex flex-col gap-4 rounded-panel border p-6 md:p-7 ${featured ? "border-lime/40 bg-lime/[0.06]" : "border-line bg-ink-2"}`}
              aria-current={isCurrent ? "true" : undefined}
            >
              <div className="flex min-h-[30px] items-center justify-between gap-2">
                <h2 className="text-2xl font-semibold">{p.name}</h2>
                {isCurrent ? (
                  <span className="rounded-full bg-bone px-2.5 py-1 text-[11px] font-semibold text-ink">Your plan</span>
                ) : featured ? (
                  <span className="rounded-full border border-lime/50 px-2.5 py-1 text-[11px] font-semibold text-lime">More room</span>
                ) : null}
              </div>

              {/* Month and year sit in the same spot and cross-fade, so the card never changes size. */}
              <div className="period-stack">
              {([false, true] as const).map((yr) => {
                const list = yr ? p.yearly : p.price;
                const shown = off && list ? afterDiscount(list, off) : list;
                return (
                  <div key={String(yr)} className={`${yr ? "period-year" : "period-month"} flex min-h-[78px] flex-col gap-1`}>
                    {off > 0 && (
                      <p className="w-fit rounded-full border border-lime/50 px-2.5 py-0.5 text-[11px] font-semibold text-lime">
                        {p.discount.label || "Offer"} · {off}% off{p.discount.endsAt ? ` · until ${new Date(p.discount.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}
                      </p>
                    )}
                    <p className="flex items-baseline gap-2 whitespace-nowrap">
                      {p.price && yr && !p.yearly ? (
                        <span className="text-[22px] font-semibold leading-[54px] whitespace-nowrap">To be confirmed</span>
                      ) : (
                        <>
                          <span className={`${bigPrice ? "text-[40px]" : "text-5xl"} font-semibold leading-[54px] tnum`}>${p.price ? shown : 0}</span>
                          {off > 0 && list > 0 && <s className="text-sm text-mute tnum">${list}</s>}
                        </>
                      )}
                      {p.price > 0 && (!yr || p.yearly > 0) && <span className="text-sm text-mute">/ {yr ? "year" : "month"}</span>}
                    </p>
                    <p className="text-xs text-mute">{!p.price ? "Free plan" : yr ? (p.yearly ? `${billing ? "Billed yearly" : "After beta"}${saving(p) ? ` · save ${saving(p)}%` : ""}` : "Yearly price, after beta") : billing ? p.blurb : "After beta"}</p>
                  </div>
                );
              })}
              </div>

              <div>
                {preview ? (
                  <span aria-hidden className={`grid h-11 place-items-center rounded-lg border text-[13px] font-semibold ${featured ? "border-lime bg-lime text-ink" : "border-line-2 text-bone"}`}>
                    {p.price ? action : "Start free"}
                  </span>
                ) : isCurrent ? (
                  <p className="grid h-11 place-items-center rounded-lg border border-line text-[13px] font-semibold text-mute">You&apos;re on this plan</p>
                ) : tooSmall ? (
                  <p className="grid min-h-11 place-items-center rounded-lg border border-line px-3 text-center text-[12px] text-mute">You have more tracks than this plan holds</p>
                ) : upgrade && !billing && !requests ? (
                  <p className="grid min-h-11 place-items-center rounded-lg border border-line px-3 text-center text-[12px] text-mute">Set by FloorTest during the beta</p>
                ) : upgrade && !billing && pendingPlan === id ? (
                  <Link href={`/dashboard/plans/request?plan=${id}`} className="grid h-11 place-items-center rounded-lg border border-lime/50 bg-lime/5 text-[13px] font-semibold text-lime">
                    Requested · in review
                  </Link>
                ) : upgrade ? (
                  <Link
                    href={billing ? `/dashboard/checkout?plan=${id}` : `/dashboard/plans/request?plan=${id}`}
                    className={`grid h-11 place-items-center rounded-lg border text-[13px] font-semibold ${featured ? "border-lime bg-lime text-ink hover:brightness-95" : "border-line-2 text-bone hover:border-bone"}`}
                  >
                    {action}
                  </Link>
                ) : (
                  <form action={setPlan.bind(null, id)}>
                    <button className="h-11 w-full rounded-lg border border-line-2 text-[13px] font-semibold text-bone hover:border-bone">Move to {p.name}</button>
                  </form>
                )}
              </div>

              <p className={`flex items-baseline gap-2 border-b pb-4 ${featured ? "border-lime/30" : "border-line"}`}>
                <span className="text-[21px] font-semibold tnum">{p.limit.toLocaleString("en")}</span>
                <span className="text-sm text-mute">active tracks</span>
              </p>

              <div className="flex flex-col gap-3.5">
                {/* The shared tools are listed once, on the first card; the others say what they add. */}
                <p className="text-xs font-semibold text-mute">{i === 0 ? "Included in every plan" : `Everything in ${plans[0].name}${extras.length ? ", plus" : ""}`}</p>
                <ul className={`flex flex-col gap-2.5 text-sm ${i === 0 ? "" : "hidden"}`}>
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
        <p>{sameTools ? "Only active-track room changes between plans." : ""}</p>
        <div className="period-stack sm:text-right">
          <p className="period-month">{billing ? "Billed monthly." : ""}</p>
          <p className="period-year">{yearlyUnset ? "Yearly pricing is not yet confirmed for every plan." : billing ? "Billed yearly." : ""}</p>
        </div>
      </div>
    </>
  );
}
