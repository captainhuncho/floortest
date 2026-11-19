import { afterDiscount, discountNow, type Plan } from "@/lib/plan-store";
import { setPlan } from "../actions/settings";
import { addsOver, liftedId, saving, SHARED, type Live } from "./plan-lines";
import type { PickAction, PickPrice, PickRow } from "./PlanPick";

type Ctx = {
  billing: boolean;
  /** Plan requests are open (switch `plan_requests`). */
  requests: boolean;
  userPlan: string | null;
  currentPrice: number;
  capUsed: number;
  capBonus: number;
  pendingPlan: string | null;
  live: Live;
  /** The page has a Monthly / Yearly switch. */
  yearly: boolean;
};

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** One period's price for a row, with the same wording the laptop cards use. */
function priceOf(p: Plan, yr: boolean, billing: boolean): PickPrice {
  if (!p.price) return { amount: "$0", note: "for good" };
  const list = yr ? p.yearly : p.price;
  if (!list) return { amount: "To be confirmed", note: "yearly price, after the beta" };
  const off = billing ? discountNow(p) : 0;
  const shown = off ? afterDiscount(list, off) : list;
  const per = yr ? "a year" : "a month";
  const note = billing
    ? `billed ${yr ? "yearly" : "monthly"}${yr && saving(p) ? `, save ${saving(p)}%` : ""}`
    : `${per} after the beta${yr && saving(p) ? `, save ${saving(p)}%` : ""}`;
  return { amount: money(shown), list: off ? money(list) : undefined, note };
}

/** What the one button does for a plan: the same choices, in the same order, as the laptop cards' buttons. */
function actionOf(p: Plan, c: Ctx): PickAction {
  if (c.userPlan === p.id) return { kind: "current" };
  if (c.capUsed > p.limit + c.capBonus) return { kind: "note", text: "You have more tracks than this plan holds" };
  const upgrade = p.price > c.currentPrice;
  if (upgrade && !c.billing && !c.requests) return { kind: "note", text: "Set by FloorTest during the beta" };
  if (upgrade && !c.billing && c.pendingPlan === p.id) return { kind: "pending", href: `/dashboard/plans/request?plan=${p.id}` };
  if (upgrade)
    return c.billing
      ? { kind: "go", href: `/dashboard/checkout?plan=${p.id}`, label: `Upgrade to ${p.name}` }
      : { kind: "go", href: `/dashboard/plans/request?plan=${p.id}`, label: `Request ${p.name}` };
  return { kind: "move", label: `Move to ${p.name}`, action: setPlan.bind(null, p.id) };
}

/** The phone pick list's rows, built on the server from the same plan data and rules as the cards. */
export function pickRows(plans: Plan[], c: Ctx): PickRow[] {
  const lift = liftedId(plans);
  return plans.map((p, i) => {
    const prev = plans[i - 1];
    const adds = addsOver(p, prev, c.live);
    return {
      id: p.id,
      name: p.name,
      tag: c.userPlan === p.id ? "Your plan" : p.id === lift && p.featured ? "Recommended" : "",
      sub: [`${p.limit.toLocaleString("en")} active tracks`, p.blurb].filter(Boolean).join(" · "),
      month: priceOf(p, false, c.billing),
      year: c.yearly ? priceOf(p, true, c.billing) : undefined,
      linesHead: i === 0 ? "Included in every plan:" : `Everything in ${prev.name}${adds.length ? ", plus:" : ""}`,
      lines: i === 0 ? [...SHARED, ...adds] : adds,
      action: actionOf(p, c),
    };
  });
}

/** The row picked when the page opens: the featured plan, else the next plan up, else the person's own. */
export function firstPick(plans: Plan[], userPlan: string | null, currentPrice: number) {
  return plans.find((p) => p.featured)?.id ?? plans.find((p) => p.price > currentPrice)?.id ?? userPlan ?? plans[0]?.id ?? "";
}
