import { siteEditor } from "@/lib/site-editor";
import { EditablePage, editable } from "@/components/Editable";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { siteCopy } from "@/lib/content";
import { offeredPlans } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";
import { teamsOn } from "@/lib/account-members";
import { BillingSwitch } from "@/app/dashboard/plans/BillingSwitch";
import { PlanCards } from "@/app/dashboard/plans/PlanCards";
import { PlanCompare } from "@/app/dashboard/plans/PlanCompare";
import { PlansIntro } from "@/app/dashboard/plans/PlansIntro";
import { bestSaving, hasYearly } from "@/app/dashboard/plans/plan-lines";

export const metadata = { title: "Pricing — FloorTest", alternates: { canonical: "/pricing" } };

/** Plans and prices, off the home page so it stays short. Prices and wording come from Admin → Plans and Site content. */
export default async function Pricing() {
  const [user, plans, c, open, editor] = await Promise.all([currentUser(), offeredPlans(), siteCopy("pricing"), switchOn("open_signup"), siteEditor()]);
  const { E } = editable(c, !!editor);
  const href = user ? "/dashboard/floor" : open ? "/signup" : "/#waitlist";
  // The same rule as the home page: Open your desk when signed in, Claim your link when sign-up is open, else an invite.
  const label = user ? "Open your desk" : open ? "Claim your link" : "Request an invite";
  const [billing, sharing, teams] = await Promise.all([switchOn("billing"), switchOn("sharing"), teamsOn()]);
  const live = { sharing, teams };
  const yearly = billing && hasYearly(plans);
  const save = bestSaving(plans);
  return (
    <EditablePage editing={!!editor} page="pricing" label="Pricing" values={c}>
    {/* Day or night with the device, in the desk's card language. One lime button: the featured plan's (or the first). */}
    <div id="plans-root" data-period="month" className="theme-system flex min-h-dvh flex-col bg-ink text-bone">
      <header className="mx-auto flex w-full max-w-[1040px] items-center justify-between gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
        <Logo />
        <Link href={href} className="inline-flex min-h-11 items-center rounded-[11px] border border-line bg-well px-3.5 text-[12.5px] font-semibold text-bone hover:border-line-2">
          {label}
        </Link>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-6 px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-4 sm:gap-8 sm:px-6 sm:pt-8">
        <PlansIntro billing={billing} kicker={billing ? "Plans and prices" : "Free during the beta"} title={<E k="pricing_title" />} sub={<E k="pricing_intro" />}>
          {yearly && (
            <>
              <BillingSwitch initial="month" target="plans-root" />
              {save > 0 && <p className="text-[12px] text-faint">Yearly saves up to {save}%</p>}
            </>
          )}
        </PlansIntro>
        {/* While billing is off every plan is free, so the cards say Free and the table leaves prices out. */}
        <PlanCards plans={plans} billing={billing} userPlan={null} currentPrice={0} sharing={sharing} teams={teams} publicCta={{ href, label }} freeInBeta note={false} />
        <PlanCompare plans={plans} billing={billing} prices={billing} live={live} />
        <p className="text-[12px] text-faint">
          <Link href="/" className="tap-text underline underline-offset-4 hover:text-bone"><E k="pricing_back" /></Link>
        </p>
      </main>
    </div>
    </EditablePage>
  );
}
