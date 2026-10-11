import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { capacity } from "@/lib/desk";
import { planOf } from "@/lib/plan-store";
import { PageTitle, Section } from "../Section";

export const metadata = { title: "Plan — FloorTest" };

export default async function Plan() {
  const user = await requireRole("owner");
  const cap = await capacity(user);
  const plan = await planOf(user.plan);
  const pct = cap.limit ? Math.min(100, Math.round((cap.used / cap.limit) * 100)) : 0;
  return (
    <>
      <PageTitle title="Plan" />
      <Section id="plan-h" title={`${plan.name} plan`}>
        <div className="flex justify-between text-sm tnum">
          <span>Active tracks</span>
          <span className="text-mute">
            {cap.used} of {cap.limit.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-3" role="progressbar" aria-label="Active tracks used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${pct >= 90 ? "bg-danger" : "bg-lime"}`} style={{ width: `${pct}%` }} />
        </div>
        {cap.bonus > 0 && <p className="mt-2 text-sm text-mute">Includes {cap.bonus} earned through referrals.</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/dashboard/plans" className={`${pct >= 80 ? "btn-lime" : "btn-ghost"} btn-sm min-h-11`}>
            See plans
          </Link>
          <Link href="/dashboard/referrals" className="btn-ghost btn-sm min-h-11">
            Invite DJs, earn slots
          </Link>
        </div>
      </Section>
    </>
  );
}
