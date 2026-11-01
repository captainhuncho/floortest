import { requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { FEATURES, switchFor, type Feature } from "@/lib/features";
import { allPlans } from "@/lib/plan-store";
import { clearSwitchRule, flipSwitch, saveSwitch, saveSwitchRule } from "../actions";
import { ConfirmButton } from "../AdminUi";
import { isTargeted, ruleCoverage, SWITCHES, switchState, type SwitchKey } from "@/lib/switches";
import { describeRule, type SwitchRule } from "@/lib/switch-rules";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/account-types";

const handlesOf = async (ids: number[]) =>
  ids.length ? (await q.all<{ handle: string }>(`SELECT handle FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids)).map((r) => r.handle) : [];

/** Held-back features, switched on per plan or for named accounts (for testing with a few people first). */
export default async function Switches() {
  await requireAdmin("switches");
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
  const site = await Promise.all(
    (Object.keys(SWITCHES) as SwitchKey[]).map(async (key) => {
      const { on, rule } = await switchState(key);
      const reach = rule && isTargeted(key) ? await ruleCoverage(key, rule) : null;
      return { key, on, rule, reach, handles: rule ? await handlesOf(rule.accounts) : [] };
    }),
  );
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Feature switches</h1>
        <p className="mt-2 text-mute">Switch a held-back feature on for whole plans, or for a few accounts to try it first. Changes apply straight away. Off is off for everyone; a switch that is on with a &ldquo;who sees it&rdquo; rule reaches only the accounts the rule covers, and ops super admins.</p>
      </div>
      <section aria-labelledby="site-h" className="space-y-3">
        <h2 id="site-h" className="text-lg font-semibold">Site-wide</h2>
        <ul className="divide-y divide-line rounded-md border border-line">
          {site.map(({ key, on, rule, reach, handles }) => (
            <li key={key} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0 max-w-2xl">
                <p className="font-bold">{SWITCHES[key].label}</p>
                <p className="mt-1 text-sm text-mute">{SWITCHES[key].description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[13px] font-semibold ${on ? "text-lime" : "text-faint"}`}>{on ? "On" : "Off"}</span>
                {/* A big switch (pins 17, 18): the track fills lime and the knob slides; it still asks before changing. */}
                <ConfirmButton
                  action={flipSwitch.bind(null, key, !on)}
                  message={`Turn ${on ? "off" : "on"} "${SWITCHES[key].label}"? It takes effect straight away for everyone.`}
                  confirmLabel={on ? "Turn off" : "Turn on"}
                  danger={key === "uploads_paused" && !on}
                  className={`admin-press relative h-11 w-[76px] shrink-0 rounded-full p-1 transition-colors duration-300 ${on ? "bg-lime" : "bg-ink-4 ring-1 ring-line-2"}`}
                >
                  <span className="sr-only">{`${on ? "Turn off" : "Turn on"} ${SWITCHES[key].label}`}</span>
                  <span
                    aria-hidden
                    className={`block size-9 rounded-full shadow-[0_2px_6px_rgb(0_0_0/0.35)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${on ? "translate-x-8 bg-ink" : "translate-x-0 bg-bone"}`}
                  />
                </ConfirmButton>
              </div>
              {isTargeted(key) && <RuleForm switchKey={key} rule={rule} reach={reach} handles={handles} plans={plans} planName={planName} />}
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

/** "Who sees it" for a targeted switch: on top of on/off, never instead of it. */
function RuleForm({
  switchKey,
  rule,
  reach,
  handles,
  plans,
  planName,
}: {
  switchKey: SwitchKey;
  rule: SwitchRule | null;
  reach: { covered: number; total: number } | null;
  handles: string[];
  plans: { id: string; name: string }[];
  planName: (id: string) => string;
}) {
  const summary = rule
    ? `${describeRule(rule, planName)} · ${reach?.covered ?? 0} of ${reach?.total ?? 0} accounts${rule.countries.length ? " at most (country is checked on each visit)" : ""}`
    : "Everyone, when on";
  return (
    <details className="w-full basis-full rounded-md border border-line">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm">
        <span className="font-semibold">Who sees it:</span>&nbsp;<span className="text-mute">{summary}</span>
      </summary>
      <form action={saveSwitchRule.bind(null, switchKey)} className="space-y-4 border-t border-line p-4">
        <p className="text-sm text-mute">
          Named accounts always get it. The rest narrows everyone else: each part you set must match, then the percentage takes the same slice every time
          for the same account. Leave everything empty for everyone.
        </p>
        <label className="block space-y-1.5">
          <span className="label">Named accounts (handles)</span>
          <input name="handles" defaultValue={handles.map((h) => `@${h}`).join(" ")} className="input" placeholder="@djname @label" autoComplete="off" />
        </label>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
          <legend className="label mb-2">Account types</legend>
          {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name={`type_${t}`} defaultChecked={!!rule?.types.includes(t)} className="accent-lime" />
              {ACCOUNT_TYPES[t]}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
          <legend className="label mb-2">Plans</legend>
          {plans.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name={`plan_${p.id}`} defaultChecked={!!rule?.plans.includes(p.id)} className="accent-lime" />
              {p.name}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="label">Countries (two-letter codes)</span>
            <input name="countries" defaultValue={rule?.countries.join(" ") ?? ""} className="input" placeholder="GB IE" autoComplete="off" autoCapitalize="characters" />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Percentage of matching accounts</span>
            <input name="percent" type="number" inputMode="numeric" min={1} max={100} defaultValue={rule?.percent ?? 100} className="input" />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn-lime btn-sm">Save rule</button>
          {rule && (
            <button formAction={clearSwitchRule.bind(null, switchKey)} className="btn-ghost btn-sm">
              Clear rule (everyone)
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
