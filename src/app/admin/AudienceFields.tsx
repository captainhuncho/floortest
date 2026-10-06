import { ACTIVITY, JOINED, type Audience } from "@/lib/audience";
import { KIND_LABEL } from "@/lib/db";
import type { Plan } from "@/lib/plan-store";

/** The shared audience filters: Users list, CSV export and Announcements. Plain form fields, no client code. */
export function AudienceFields({ a, plans }: { a: Audience; plans: Plan[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="block space-y-1.5">
        <span className="label">Type</span>
        <select name="kind" defaultValue={a.kind} className="input">
          <option value="">Everyone</option>
          {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="label">Plan</span>
        <select name="plan" defaultValue={a.plan} className="input">
          <option value="">Any plan</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="label">Tag</span>
        <input name="tag" defaultValue={a.tag} placeholder="e.g. beta-1" className="input" />
      </label>
      <label className="block space-y-1.5">
        <span className="label">Joined</span>
        <select name="joined" defaultValue={String(a.joined)} className="input">
          {Object.entries(JOINED).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="label">Activity</span>
        <select name="activity" defaultValue={a.activity} className="input">
          {Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
    </div>
  );
}
