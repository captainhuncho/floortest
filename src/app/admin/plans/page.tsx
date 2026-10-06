import Link from "next/link";
import { q } from "@/lib/db";
import { allPlans, FREE_PLAN } from "@/lib/plan-store";
import { addPlan, deletePlan, savePlan, setPlanOffered } from "../actions";
import { ConfirmButton } from "../AdminUi";

/** Prices, track limits and wording for every plan. Changes show on the site straight away. */
export default async function Plans() {
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
        return (
          <section key={p.id} aria-labelledby={`plan-${p.id}`} className={`space-y-4 rounded-md border p-5 ${p.retired ? "border-line opacity-80" : "border-line"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`plan-${p.id}`} className="text-lg font-bold">
                {p.name} <span className="text-sm font-normal text-mute">· {p.id}</span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="chip border-line text-mute">{users} account{users === 1 ? "" : "s"}</span>
                <span className={`chip ${p.retired ? "border-line text-mute" : "border-lime/50 text-lime"}`}>{p.retired ? "Hidden" : "Offered"}</span>
              </div>
            </div>
            <form action={savePlan.bind(null, p.id)} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="label">Name</span>
                <input name="name" defaultValue={p.name} required maxLength={40} className="input" />
              </label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="space-y-1.5">
                  <span className="label">Price (US$ / month)</span>
                  <input name="price" type="number" min={0} max={1000} step="0.01" defaultValue={p.price} disabled={p.id === FREE_PLAN} className="input tnum" />
                  {p.id === FREE_PLAN && <input type="hidden" name="price" value="0" />}
                </label>
                <label className="space-y-1.5">
                  <span className="label">Track limit</span>
                  <input name="limit" type="number" min={1} defaultValue={p.limit} className="input tnum" />
                </label>
                <label className="space-y-1.5">
                  <span className="label">EP/album folders (MB, 0 = off)</span>
                  <input name="folder_mb" type="number" min={0} max={20480} defaultValue={Math.round(p.folderBytes / 1048576)} className="input tnum" />
                </label>
                <label className="space-y-1.5">
                  <span className="label">Order</span>
                  <input name="position" type="number" defaultValue={p.position} className="input tnum" />
                </label>
              </div>
              <label className="space-y-1.5 md:col-span-2">
                <span className="label">Short line under the price</span>
                <input name="blurb" defaultValue={p.blurb} maxLength={200} className="input" />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="label">Feature list (one per line)</span>
                <textarea name="features" defaultValue={p.features.join("\n")} rows={Math.max(3, p.features.length + 1)} className="input" />
              </label>
              <div className="flex flex-wrap gap-5 md:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="featured" defaultChecked={p.featured} className="accent-lime" /> Recommended badge
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="share_downloads" defaultChecked={p.shareDownloads} className="accent-lime" /> Colleagues can download shared tracks
                </label>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <button className="btn-lime btn-sm">Save {p.name}</button>
              </div>
            </form>
            {p.id !== FREE_PLAN && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <ConfirmButton
                  action={setPlanOffered.bind(null, p.id, p.retired)}
                  message={p.retired ? `Offer ${p.name} on the site and plans page?` : `Retire ${p.name}? The ${users} account(s) on it keep it; nobody new can pick it.`}
                  confirmLabel={p.retired ? "Offer it" : "Retire"}
                  className="btn-ghost btn-sm"
                >
                  {p.retired ? "Offer this plan" : "Retire"}
                </ConfirmButton>
                {users === 0 && (
                  <ConfirmButton action={deletePlan.bind(null, p.id)} message={`Delete ${p.name} for good?`} confirmLabel="Delete" danger className="btn-ghost btn-sm">
                    Delete
                  </ConfirmButton>
                )}
              </div>
            )}
          </section>
        );
      })}
      <form action={addPlan} className="flex flex-wrap items-end gap-3 rounded-md border border-dashed border-line p-5">
        <label className="space-y-1.5">
          <span className="label">New plan code</span>
          <input name="id" required pattern="[a-z][a-z0-9_]{1,23}" placeholder="label" className="input" />
        </label>
        <label className="space-y-1.5">
          <span className="label">Name</span>
          <input name="name" required maxLength={40} placeholder="Label" className="input" />
        </label>
        <button className="btn-ghost btn-sm">Add plan</button>
        <p className="w-full text-xs text-dim">New plans start hidden so you can fill them in first. The code can&apos;t change later.</p>
      </form>
    </div>
  );
}
