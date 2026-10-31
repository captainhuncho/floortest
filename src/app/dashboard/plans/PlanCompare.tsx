import { fmtBytes } from "@/lib/format";
import { afterDiscount, discountNow, type Plan } from "@/lib/plan-store";
import { CARD, Icon } from "@/components/Kit";
import { hasYearly, ownLines, SHARED, type Live } from "./plan-lines";

/** A cell: a value, a tick (included) or a dash (not included). Ticks and dashes carry words for screen readers. */
type Cell = string | boolean;
type Row = { label: string; cells: Cell[] };

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * Every row comes from the plans themselves (Admin → Plans): prices, room, what the plan's settings enable, ops' own
 * feature lines and the tools every plan shares. Nothing here is written by hand, so it can't promise more than a plan
 * gives.
 */
export function compareRows(plans: Plan[], { billing, prices, live }: { billing: boolean; prices: boolean; live: Live }): Row[] {
  const rows: Row[] = [];
  if (prices) {
    const now = (p: Plan, list: number) => {
      const off = billing ? discountNow(p) : 0;
      return off && list ? afterDiscount(list, off) : list;
    };
    rows.push({ label: "Monthly price", cells: plans.map((p) => money(p.price ? now(p, p.price) : 0)) });
    if (hasYearly(plans)) rows.push({ label: "Yearly price", cells: plans.map((p) => (!p.price ? "$0" : p.yearly ? money(now(p, p.yearly)) : "To be confirmed")) });
  }
  rows.push({ label: "Active tracks", cells: plans.map((p) => p.limit.toLocaleString("en")) });
  rows.push({ label: "Send folders (EP or album)", cells: plans.map((p) => (p.folderBytes > 0 ? `Up to ${fmtBytes(p.folderBytes)}` : false)) });
  rows.push({ label: "Track artwork from senders", cells: plans.map((p) => p.trackArt) });
  if (live.teams) rows.push({ label: "People on one account", cells: plans.map((p) => String(p.seats)) });
  // Ops' own lines, each once, ticked on the plans that list it.
  const own = [...new Map(plans.flatMap((p) => (p.price > 0 ? ownLines(p, live) : [])).map((f) => [f.toLowerCase(), f])).values()];
  const skip = /^send folders|^track artwork|people on one account/i;
  for (const f of own.filter((f) => !skip.test(f))) rows.push({ label: f, cells: plans.map((p) => p.price > 0 && ownLines(p, live).some((l) => l.toLowerCase() === f.toLowerCase())) });
  for (const f of SHARED) rows.push({ label: f, cells: plans.map(() => true) });
  return rows;
}

function CellView({ v }: { v: Cell }) {
  if (v === true)
    return (
      <>
        <Icon name="tick" className="mx-auto size-4 text-bone" />
        <span className="sr-only">Included</span>
      </>
    );
  if (v === false)
    return (
      <>
        <span aria-hidden className="text-faint">–</span>
        <span className="sr-only">Not included</span>
      </>
    );
  return <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-bone tnum">{v}</span>;
}

/**
 * "Compare every plan": one table, plans across, features down. On phones it scrolls sideways inside its card with the
 * feature names pinned on the left, so the page itself never scrolls sideways.
 */
export function PlanCompare({
  plans,
  billing,
  prices,
  live,
  userPlan = null,
  note,
}: {
  plans: Plan[];
  billing: boolean;
  /** Show the price rows (off on the pricing page while every plan is free in the beta). */
  prices: boolean;
  live: Live;
  userPlan?: string | null;
  /** A short line beside the title, e.g. that prices start after the beta. */
  note?: string;
}) {
  const rows = compareRows(plans, { billing, prices, live });
  return (
    <section aria-labelledby="compare-h" className={`${CARD} min-w-0 overflow-hidden`}>
      <div className="flex flex-col gap-1 border-b border-line px-4 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:px-6">
        <h2 id="compare-h" className="text-[17px] font-semibold tracking-[-0.02em] text-bone">
          Compare every plan
        </h2>
        {note && <p className="text-[12px] text-faint">{note}</p>}
      </div>
      {/* Focusable so keyboard users can scroll it sideways on narrow screens. */}
      <div className="overflow-x-auto overscroll-x-contain" tabIndex={0} role="region" aria-labelledby="compare-h">
        <table className="w-full min-w-[480px] border-collapse text-left text-[13px]">
          <caption className="sr-only">What each plan includes</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-[1] bg-card px-4 py-3 text-[12px] font-semibold text-mute sm:px-6">
                Features
              </th>
              {plans.map((p) => (
                <th key={p.id} scope="col" className="px-3 py-3 text-center align-bottom">
                  <span className="block text-[13px] font-semibold text-bone">{p.name}</span>
                  {userPlan === p.id && <span className="block whitespace-nowrap text-[11px] font-medium text-faint">Your plan</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-line last:border-b-0">
                <th scope="row" className="sticky left-0 z-[1] w-[46%] min-w-[150px] bg-card px-4 py-3 font-normal leading-5 text-bone sm:max-w-none sm:px-6">
                  {r.label}
                </th>
                {r.cells.map((c, i) => (
                  <td key={plans[i].id} className="px-3 py-3 text-center">
                    <CellView v={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
