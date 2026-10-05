import { q } from "@/lib/db";
import { FEATURES, switchFor, type Feature } from "@/lib/features";
import { allPlans } from "@/lib/plan-store";
import { flipSwitch, saveSwitch } from "../actions";
import { ConfirmButton } from "../AdminUi";
import { SWITCHES, switchOn, type SwitchKey } from "@/lib/switches";

/** Held-back features, switched on per plan or for named accounts (for testing with a few people first). */
export default async function Switches() {
  const plans = await allPlans();
  const list = await Promise.all(
    (Object.keys(FEATURES) as Feature[]).map(async (f) => {
      const s = await switchFor(f);
      const handles = s.users.length
        ? (await q.all<{ handle: string }>(`SELECT handle FROM users WHERE id IN (${s.users.map(() => "?").join(",")})`, ...s.users)).map((r) => r.handle)
        : [];
      return { f, s, handles };
    }),
  );
  const site = await Promise.all((Object.keys(SWITCHES) as SwitchKey[]).map(async (key) => ({ key, on: await switchOn(key) })));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Feature switches</h1>
        <p className="mt-2 text-mute">Switch a held-back feature on for whole plans, or for a few accounts to try it first. Changes apply straight away.</p>
      </div>
      <section aria-labelledby="site-h" className="space-y-3">
        <h2 id="site-h" className="text-lg font-semibold">Site-wide</h2>
        <ul className="divide-y divide-line rounded-md border border-line">
          {site.map(({ key, on }) => (
            <li key={key} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0 max-w-2xl">
                <p className="font-bold">{SWITCHES[key].label}</p>
                <p className="mt-1 text-sm text-mute">{SWITCHES[key].description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`chip ${on ? "border-lime/50 text-lime" : "border-line text-mute"}`}>{on ? "On" : "Off"}</span>
                <ConfirmButton
                  action={flipSwitch.bind(null, key, !on)}
                  message={`Turn ${on ? "off" : "on"} "${SWITCHES[key].label}"? It takes effect straight away for everyone.`}
                  confirmLabel={on ? "Turn off" : "Turn on"}
                  danger={key === "uploads_paused" && !on}
                  className="btn-ghost btn-sm"
                >
                  {on ? "Turn off" : "Turn on"}
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <h2 className="text-lg font-semibold">By plan or account</h2>
      {list.map(({ f, s, handles }) => (
        <form key={f} action={saveSwitch.bind(null, f)} className="space-y-4 rounded-md border border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-bold">{FEATURES[f].label}</p>
            <span className={`chip ${s.plans.length || s.users.length ? "border-lime/50 text-lime" : "border-line text-mute"}`}>
              {s.plans.length ? `On for ${s.plans.map((p) => plans.find((x) => x.id === p)?.name ?? p).join(", ")}` : s.users.length ? `On for ${s.users.length} account${s.users.length === 1 ? "" : "s"}` : "Off"}
            </span>
          </div>
          <p className="text-sm text-mute">{FEATURES[f].description}</p>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="label mb-2">Plans</legend>
            {plans.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`plan_${p.id}`} defaultChecked={s.plans.includes(p.id)} className="accent-lime" />
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
    </div>
  );
}
