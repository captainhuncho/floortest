import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { allPlans, FREE_PLAN, type Plan } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";
import { BillingSwitch } from "@/app/dashboard/plans/BillingSwitch";
import { PlanCards } from "@/app/dashboard/plans/PlanCards";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const num = (v: string | string[] | undefined, fallback: number) => (one(v).trim() === "" || !Number.isFinite(Number(one(v))) ? fallback : Number(one(v)));

/**
 * Admin → Plans → Preview: the real plan cards with one plan's unsaved edits applied, opened from that plan's form.
 * Nothing is saved; buttons on the cards do nothing here.
 */
export default async function PlanPreview({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin("plans.read");
  const sp = await searchParams;
  const id = one(sp.plan);
  const [all, billing, sharing] = await Promise.all([allPlans(), switchOn("billing"), switchOn("sharing")]);
  const edited = all.find((p) => p.id === id);
  const apply = (p: Plan): Plan => {
    if (p.id !== id) return p;
    const free = p.id === FREE_PLAN;
    const endsOn = one(sp.discount_ends).trim();
    return {
      ...p,
      name: one(sp.name).trim().slice(0, 40) || p.name,
      price: free ? 0 : Math.max(0, num(sp.price, p.price)),
      yearly: free ? 0 : Math.max(0, num(sp.yearly, p.yearly)),
      limit: Math.max(1, Math.floor(num(sp.limit, p.limit))),
      blurb: one(sp.blurb).slice(0, 200),
      features: one(sp.features).split("\n").map((f) => f.trim()).filter(Boolean).slice(0, 20),
      featured: one(sp.featured) === "on",
      discount: free
        ? p.discount
        : {
            pct: Math.min(90, Math.max(0, Math.round(num(sp.discount_pct, p.discount.pct)))),
            label: one(sp.discount_label).trim().slice(0, 40),
            endsAt: endsOn ? Date.parse(`${endsOn}T23:59:59Z`) || null : null,
          },
    };
  };
  // What visitors would see: offered plans (plus the edited one, so a retired plan can be previewed too), in order.
  const plans = all
    .filter((p) => !p.retired || p.id === id)
    .map(apply)
    .sort((a, b) => a.position - b.position || a.price - b.price);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-lime/40 bg-lime/5 px-4 py-3">
        <p className="text-sm">
          <span className="font-bold">Preview, not saved.</span>{" "}
          {edited ? `Showing your edits to ${edited.name}. Close this tab and press Save changes to make them live.` : "No plan picked; showing the plans as they are."}
        </p>
        <Link href="/admin/plans" className="btn-ghost btn-sm">Back to Plans</Link>
      </div>
      <div id="plans-root" data-period="month" className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-[28px] tracking-[-0.5px] md:text-[36px]">Choose your plan</h1>
          <p className="text-[15px] text-mute">Same desk. Pick the room you need.</p>
          <BillingSwitch initial="month" target="plans-root" />
        </header>
        <PlanCards plans={plans} billing={billing} userPlan={null} currentPrice={0} preview sharing={sharing} teams />
      </div>
    </div>
  );
}
