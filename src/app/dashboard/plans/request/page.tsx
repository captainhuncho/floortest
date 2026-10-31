import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { offeredPlan, planOf } from "@/lib/plan-store";
import { pendingRequest, REQUEST_KINDS, VOLUMES } from "@/lib/plan-requests";
import { switchOn } from "@/lib/switches";
import { requestPlan, withdrawPlanRequest } from "../../actions/settings";
import { CARD, PageHead } from "@/components/Kit";

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
  if (!(await switchOn("plan_requests", user))) redirect("/dashboard/plans");
  const [billing, plan, current, open] = await Promise.all([switchOn("billing"), offeredPlan(String(sp.plan ?? "")), planOf(user.plan), pendingRequest(user.id)]);
  // Once paid plans start, people choose and pay for themselves.
  if (billing) redirect(plan ? `/dashboard/checkout?plan=${plan.id}` : "/dashboard/plans");
  if (!plan || plan.price <= current.price) redirect("/dashboard/plans");
  const guess = user.kind === "label_radio" || user.kind === "ar" ? "label" : user.kind === "music_pro" ? "management" : user.kind ? "artist" : "";

  return (
    <div className="page-gutter py-4 text-bone sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-4 sm:gap-5">
      <Link href="/dashboard/plans" className="tap-text -my-2 w-fit text-[11.5px] font-medium text-faint hover:text-bone">
        ← Plans
      </Link>
      <header className="flex flex-col gap-2">
        <PageHead label="Free for the rest of the beta" title={`Request ${plan.name}`} />
        <p className="text-[13.5px] leading-6 text-mute">
          During the beta we set plans up by hand, so everyone gets the room that fits how they work. Tell us a little about you and we&apos;ll be in touch,
          usually within two working days. It&apos;s free for the rest of the beta.
        </p>
      </header>

      {open && (
        <div role="status" className={`${CARD} flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-[13px]`}>
          <span>You already asked for {open.plan === plan.id ? plan.name : open.plan}. Sending this replaces it.</span>
          <form action={withdrawPlanRequest}>
            <button className="text-xs text-mute underline underline-offset-4 hover:text-bone tap-text">Withdraw it</button>
          </form>
        </div>
      )}
      {sp.error && ERRORS[sp.error] && (
        <p role="alert" className="rounded-[13px] border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px]">
          {ERRORS[sp.error]}
        </p>
      )}

      <form action={requestPlan} className={`${CARD} space-y-5 p-4 sm:p-5`}>
        <input type="hidden" name="plan" value={plan.id} />
        <fieldset className="space-y-2">
          <legend className="label mb-1">What are you?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(REQUEST_KINDS).map(([k, label]) => (
              <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[11px] border border-line bg-well px-3 py-2 text-[13px] has-[:checked]:border-lime/60 has-[:checked]:bg-lime/10">
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
          <span className="block text-[11.5px] text-faint">Website, label page, Beatport, Spotify or Instagram</span>
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
          <Link href="/dashboard/plans" className="tap-text justify-center text-[13px] text-mute hover:text-bone">
            Cancel
          </Link>
          <button className="btn-lime min-h-11 w-full rounded-[13px] sm:w-auto">Send request</button>
        </div>
      </form>
      </div>
    </div>
  );
}
