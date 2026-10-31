import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { switchOn } from "@/lib/switches";
import { capacity } from "@/lib/desk";
import { planOf } from "@/lib/plan-store";
import { Chip } from "@/components/Kit";
import { PageTitle, Section } from "../Section";
import { BTN, BTN_GHOST } from "../ui";

export const metadata = { title: "Plan — FloorTest" };

export default async function Plan() {
  const user = await requireRole("owner");
  const cap = await capacity(user);
  const plan = await planOf(user.plan);
  const pct = cap.limit ? Math.min(100, Math.round((cap.used / cap.limit) * 100)) : 0;
  const referrals = await switchOn("referrals", user);
  return (
    <>
      <PageTitle title="Plan" sub="How much of your desk is in use, and room to grow." />
      <Section id="plan-h" icon="card" title={`${plan.name} plan`}>
        <div className="flex items-baseline justify-between gap-2 text-[12px] text-mute tnum">
          <span>
            <strong className="text-[15px] font-semibold text-bone">{cap.used}</strong> of {cap.limit.toLocaleString()} active tracks
          </span>
          {pct >= 90 ? <Chip tone="down">{pct}% used</Chip> : pct >= 80 ? <Chip tone="warn">{pct}% used</Chip> : <span>{pct}% used</span>}
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line-2" role="progressbar" aria-label="Active tracks used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${pct >= 90 ? "bg-danger" : "bg-lime"}`} style={{ width: `${pct}%` }} />
        </div>
        {cap.bonus > 0 && <p className="mt-2.5 text-[12px] text-mute">Includes {cap.bonus} earned through referrals.</p>}
        {pct >= 90 && <p className="mt-2.5 text-[12px] text-mute">Nearly full. Delete tracks you&apos;ve passed on, or see plans for more room.</p>}
        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
          <Link href="/dashboard/plans" className={pct >= 80 ? BTN : BTN_GHOST}>
            See plans
          </Link>
          {referrals && (
            <Link href="/dashboard/referrals" className={BTN_GHOST}>
              Invite DJs, earn slots
            </Link>
          )}
        </div>
      </Section>
    </>
  );
}
