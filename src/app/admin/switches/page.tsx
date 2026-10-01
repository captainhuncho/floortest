import { q } from "@/lib/db";
import { FEATURES, switchFor, type Feature } from "@/lib/features";
import { PLANS } from "@/lib/plans";
import { saveSwitch } from "../actions";

/** Held-back features, switched on per plan or for named accounts (for testing with a few people first). */
export default async function Switches() {
  const list = await Promise.all(
    (Object.keys(FEATURES) as Feature[]).map(async (f) => {
      const s = await switchFor(f);
      const handles = s.users.length
        ? (await q.all<{ handle: string }>(`SELECT handle FROM users WHERE id IN (${s.users.map(() => "?").join(",")})`, ...s.users)).map((r) => r.handle)
        : [];
      return { f, s, handles };
    }),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Feature switches</h1>
        <p className="mt-2 text-mute">Switch a held-back feature on for whole plans, or for a few accounts to try it first. Changes apply straight away.</p>
      </div>
      {list.map(({ f, s, handles }) => (
        <form key={f} action={saveSwitch.bind(null, f)} className="space-y-4 rounded-md border border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-bold">{FEATURES[f].label}</p>
            <span className={`chip ${s.plans.length || s.users.length ? "border-lime/50 text-lime" : "border-line text-mute"}`}>
              {s.plans.length ? `On for ${s.plans.map((p) => PLANS[p as keyof typeof PLANS]?.name ?? p).join(", ")}` : s.users.length ? `On for ${s.users.length} account${s.users.length === 1 ? "" : "s"}` : "Off"}
            </span>
          </div>
          <p className="text-sm text-mute">{FEATURES[f].description}</p>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="label mb-2">Plans</legend>
            {Object.entries(PLANS).map(([id, p]) => (
              <label key={id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`plan_${id}`} defaultChecked={s.plans.includes(id)} className="accent-lime" />
                {p.name}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1.5">
            <span className="label">Also on for these accounts (handles)</span>
            <input name="handles" defaultValue={handles.map((h) => `@${h}`).join(" ")} className="input" placeholder="@djname @label" />
          </label>
          <button className="btn-lime btn-sm">Save</button>
        </form>
      ))}
      <div className="rounded-md border border-line p-5">
        <p className="text-lg font-bold">Sharing with colleagues</p>
        <p className="mt-1 text-sm text-mute">Held until after the beta and the lawyer&apos;s wording. It involves the artist and the colleague as well as the receiver, so it&apos;s switched on in code for everyone at once, not from here.</p>
      </div>
    </div>
  );
}
