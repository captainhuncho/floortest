import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { q } from "@/lib/db";
import { afterDiscount, allPlans, discountNow, FREE_PLAN } from "@/lib/plan-store";
import { addPlan, deletePlan, savePlan, setPlanOffered } from "../actions";
import { ConfirmButton } from "../AdminUi";
import { PlanPricing } from "./PlanPricing";

/** Prices, track limits and wording for every plan. Changes show on the site straight away. */
export default async function Plans() {
  const me = await requireAdmin("plans.read");
  // Editing plans and prices is the super admin's; anyone else with access sees them read-only.
  const canEdit = me.access.super;
  const plans = await allPlans();
  const counts = new Map((await q.all<{ plan: string; n: number }>("SELECT plan, COUNT(*) AS n FROM users GROUP BY plan")).map((r) => [r.plan, Number(r.n)]));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plans</h1>
        <p className="mt-2 text-mute">
          Prices, track limits and the words on plan cards. Saving changes the site straight away. Which held-back features a plan unlocks is set in{" "}
          <Link href="/admin/switches" className="underline underline-offset-4">Feature switches</Link>.
        </p>
      </div>
      {plans.map((p) => {
        const users = counts.get(p.id) ?? 0;
        const free = p.id === FREE_PLAN;
        const formId = `plan-form-${p.id}`;
        const legend = "text-xs font-semibold uppercase tracking-wider text-mute";
        return (
          <section key={p.id} aria-labelledby={`plan-${p.id}`} className={`overflow-hidden rounded-md border border-line bg-ink-2 ${p.retired ? "opacity-80" : ""}`}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h2 id={`plan-${p.id}`} className="text-lg font-bold">
                {p.name} <span className="text-sm font-normal text-mute">{p.id}</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <span className="chip border-line text-mute">{users} {users === 1 ? "person" : "people"} on it</span>
                {p.featured && <span className="chip border-lime/50 text-lime">Recommended</span>}
                {discountNow(p) > 0 && <span className="chip border-lime/50 text-lime">{discountNow(p)}% off</span>}
                <span className={`chip ${p.retired ? "border-line text-mute" : "border-lime/50 text-lime"}`}>{p.retired ? "Retired" : "Offered"}</span>
              </div>
            </header>

            <form id={formId} action={savePlan.bind(null, p.id)} className="px-5 py-5">
              <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-90">
              <fieldset className="space-y-3">
                <legend className={legend}>Pricing</legend>
                {free ? (
                  <>
                    <input type="hidden" name="price" value="0" />
                    <input type="hidden" name="yearly" value="0" />
                    <p className="input max-w-xs text-mute">Free, always</p>
                  </>
                ) : (
                  <PlanPricing monthly={p.price} yearly={p.yearly} />
                )}
              </fieldset>

              {!free && (
                <fieldset className="space-y-3">
                  <legend className={legend}>Discount</legend>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <label className="block space-y-1.5">
                      <span className="label">Percent off</span>
                      <input name="discount_pct" type="number" min={0} max={90} step={1} defaultValue={p.discount.pct} className="input tnum" />
                      <span className="block text-xs text-dim">0 = no discount; list prices stay as set above</span>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="label">Label</span>
                      <input name="discount_label" defaultValue={p.discount.label} maxLength={40} placeholder="Launch offer" className="input" />
                      <span className="block text-xs text-dim">Shown on the plan card</span>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="label">Last day</span>
                      <input name="discount_ends" type="date" defaultValue={p.discount.endsAt ? new Date(p.discount.endsAt).toISOString().slice(0, 10) : ""} className="input tnum" />
                      <span className="block text-xs text-dim">Leave empty to run until you turn it off</span>
                    </label>
                  </div>
                  {discountNow(p) > 0 && (
                    <p className="text-xs text-lime">
                      Running now: ${afterDiscount(p.price, discountNow(p))} / month{p.yearly ? ` · $${afterDiscount(p.yearly, discountNow(p))} / year` : ""}
                    </p>
                  )}
                  {p.discount.pct > 0 && discountNow(p) === 0 && <p className="text-xs text-mute">Ended; set a new last day or put it to 0.</p>}
                </fieldset>
              )}

              <fieldset className="space-y-3">
                <legend className={legend}>Capacity</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="label">Track limit</span>
                    <input name="limit" type="number" min={1} defaultValue={p.limit} required className="input tnum" />
                    <span className="block text-xs text-dim">Active tracks a receiver can hold</span>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="label">Folder storage (MB)</span>
                    <input name="folder_mb" type="number" min={0} max={20480} defaultValue={Math.round(p.folderBytes / 1048576)} className="input tnum" />
                    <span className="block text-xs text-dim">Largest EP/album folder; 0 = folders off</span>
                  </label>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className={legend}>Display</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label className="block space-y-1.5 sm:col-span-2">
                    <span className="label">Name</span>
                    <input name="name" defaultValue={p.name} required maxLength={40} className="input" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="label">Order</span>
                    <input name="position" type="number" defaultValue={p.position} className="input tnum" />
                    <span className="block text-xs text-dim">Lower shows first</span>
                  </label>
                  <label className="block space-y-1.5 sm:col-span-3">
                    <span className="label">Line under the price</span>
                    <input name="blurb" defaultValue={p.blurb} maxLength={200} className="input" />
                  </label>
                  <label className="block space-y-1.5 sm:col-span-3">
                    <span className="label">Features</span>
                    <textarea name="features" defaultValue={p.features.join("\n")} rows={Math.max(3, p.features.length + 1)} className="input" />
                    <span className="block text-xs text-dim">One per line</span>
                  </label>
                  <label className="flex items-start gap-3 rounded-md border border-line px-3 py-2.5 text-sm sm:col-span-3">
                    <input type="checkbox" name="featured" defaultChecked={p.featured} className="mt-0.5 size-4 accent-lime" />
                    <span>
                      <span className="font-medium">Recommended badge</span>
                      <span className="block text-xs text-mute">Highlights this plan on the plans page.</span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className={legend}>Access</legend>
                <label className="flex items-start gap-3 rounded-md border border-line px-3 py-2.5 text-sm">
                  <input type="checkbox" name="share_downloads" defaultChecked={p.shareDownloads} className="mt-0.5 size-4 accent-lime" />
                  <span>
                    <span className="font-medium">Colleagues can download shared tracks</span>
                    <span className="block text-xs text-mute">When this plan&apos;s receivers share a collection, colleagues get the download button.</span>
                  </span>
                </label>
              </fieldset>
              </fieldset>
            </form>

            {canEdit && (
            <footer className="flex flex-col-reverse gap-3 border-t border-line bg-ink px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row">
                {!free && (
                  <ConfirmButton
                    action={setPlanOffered.bind(null, p.id, p.retired)}
                    message={p.retired ? `Offer ${p.name} on the site and plans page?` : `Retire ${p.name}? The ${users} account(s) on it keep it; nobody new can pick it.`}
                    confirmLabel={p.retired ? "Offer it" : "Retire"}
                    className="btn-ghost btn-sm w-full sm:w-auto"
                  >
                    {p.retired ? "Offer this plan" : "Retire"}
                  </ConfirmButton>
                )}
                {!free && users === 0 && (
                  <ConfirmButton action={deletePlan.bind(null, p.id)} message={`Delete ${p.name} for good?`} confirmLabel="Delete" danger className="btn-sm w-full rounded-md border border-danger/50 px-4 text-danger hover:bg-danger/10 sm:w-auto">
                    Delete
                  </ConfirmButton>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {/* Opens the real plan cards with these unsaved edits, in a new tab; nothing is saved. */}
                <button form={formId} name="plan" value={p.id} formAction="/admin/plans/preview" formMethod="get" formTarget="_blank" formNoValidate className="btn-ghost btn-sm w-full sm:w-auto">
                  Preview ↗
                </button>
                <button form={formId} className="btn-lime btn-sm w-full sm:w-auto">Save changes</button>
              </div>
            </footer>
            )}
          </section>
        );
      })}

      {canEdit && (
      <form action={addPlan} className="overflow-hidden rounded-md border border-dashed border-line">
        <header className="border-b border-dashed border-line px-5 py-4">
          <h2 className="text-lg font-bold">New plan</h2>
        </header>
        <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="label">Code</span>
            <input name="id" required pattern="[a-z][a-z0-9_]{1,23}" placeholder="label" className="input" />
            <span className="block text-xs text-dim">Lowercase, used in links; can&apos;t change later</span>
          </label>
          <label className="block space-y-1.5">
            <span className="label">Name</span>
            <input name="name" required maxLength={40} placeholder="Label" className="input" />
          </label>
        </div>
        <footer className="flex flex-col gap-3 border-t border-dashed border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-mute">New plans start retired so you can fill them in first.</p>
          <button className="btn-lime btn-sm w-full sm:w-auto">Add plan</button>
        </footer>
      </form>
      )}
    </div>
  );
}
