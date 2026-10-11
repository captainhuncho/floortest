import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { offeredPlan, planOf } from "@/lib/plan-store";
import { pendingRequest, REQUEST_KINDS, VOLUMES } from "@/lib/plan-requests";
import { switchOn } from "@/lib/switches";
import { requestPlan, withdrawPlanRequest } from "../../actions/settings";

export const metadata = { title: "Request a plan — FloorTest" };

const ERRORS: Record<string, string> = {
  kind: "Tell us what you are.",
  link: "That link doesn't look right. Start it with https://",
  limit: "You've sent a few requests today. Try again tomorrow.",
};

/** During the beta, Pro and Team are given on request: a few questions so we can give you the plan that fits. */
export default async function RequestPlan({ searchParams }: { searchParams: Promise<{ plan?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [billing, plan, current, open] = await Promise.all([switchOn("billing"), offeredPlan(String(sp.plan ?? "")), planOf(user.plan), pendingRequest(user.id)]);
  // Once paid plans start, people choose and pay for themselves.
  if (billing) redirect(plan ? `/dashboard/checkout?plan=${plan.id}` : "/dashboard/plans");
  if (!plan || plan.price <= current.price) redirect("/dashboard/plans");
  const guess = user.kind === "label" ? "label" : user.kind ? "artist" : "";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-5 text-bone sm:px-8 md:py-8">
      <Link href="/dashboard/plans" className="text-[11px] font-medium text-faint hover:text-bone">
        ← Plans
      </Link>
      <header className="space-y-2">
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone">Request {plan.name}</h1>
        <p className="text-[15px] text-mute">
          During the beta we set plans up by hand, so everyone gets the room that fits how they work. Tell us a little about you and we&apos;ll be in touch,
          usually within two working days. It&apos;s free for the rest of the beta.
        </p>
      </header>

      {open && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          <span>You already asked for {open.plan === plan.id ? plan.name : open.plan}. Sending this replaces it.</span>
          <form action={withdrawPlanRequest}>
            <button className="text-xs text-mute underline underline-offset-4 hover:text-bone tap-text">Withdraw it</button>
          </form>
        </div>
      )}
      {sp.error && ERRORS[sp.error] && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          {ERRORS[sp.error]}
        </p>
      )}

      <form action={requestPlan} className="space-y-5 rounded-lg border border-line bg-ink-2 p-5 md:p-6">
        <input type="hidden" name="plan" value={plan.id} />
        <fieldset className="space-y-2">
          <legend className="label mb-1">What are you?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(REQUEST_KINDS).map(([k, label]) => (
              <label key={k} className="flex min-h-11 items-center gap-3 rounded-md border border-line px-3 py-2 text-sm has-[:checked]:border-lime/60 has-[:checked]:bg-lime/5">
                <input type="radio" name="kind" value={k} required defaultChecked={k === guess} className="size-4 accent-lime" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block space-y-1.5">
          <span className="label">Name or company</span>
          <input name="org" maxLength={120} placeholder="e.g. Afterlife Records" className="input" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">A link to your work</span>
          <input name="link" type="url" maxLength={300} placeholder="https://" className="input" />
          <span className="block text-xs text-dim">Website, label page, Beatport, Spotify or Instagram</span>
        </label>
        <label className="block space-y-1.5">
          <span className="label">Tracks you receive</span>
          <select name="volume" defaultValue="" className="input">
            <option value="">Not sure</option>
            {VOLUMES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="label">Anything else? (optional)</span>
          <textarea name="note" rows={3} maxLength={1000} className="input" />
        </label>
        <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/dashboard/plans" className="text-sm text-mute hover:text-bone">
            Cancel
          </Link>
          <button className="btn-lime w-full sm:w-auto">Send request</button>
        </div>
      </form>
    </div>
  );
}
