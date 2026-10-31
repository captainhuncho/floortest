import { siteEditor } from "@/lib/site-editor";
import { EditablePage, editable } from "@/components/Editable";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { CARD, Chip, Icon } from "@/components/Kit";
import { currentUser } from "@/lib/auth";
import { siteCopy } from "@/lib/content";
import { afterDiscount, discountNow, offeredPlans, planGrid } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";

export const metadata = { title: "Pricing — FloorTest", alternates: { canonical: "/pricing" } };

/** Plans and prices, off the home page so it stays short. Prices and wording come from Admin → Plans and Site content. */
export default async function Pricing() {
  const [user, plans, c, open, editor] = await Promise.all([currentUser(), offeredPlans(), siteCopy("pricing"), switchOn("open_signup"), siteEditor()]);
  const { E } = editable(c, !!editor);
  const href = user ? "/dashboard/floor" : open ? "/signup" : "/#waitlist";
  // The same rule as the home page: Open your desk when signed in, Claim your link when sign-up is open, else an invite.
  const label = user ? "Open your desk" : open ? "Claim your link" : "Request an invite";
  const billing = await switchOn("billing");
  const lime = (plans.find((p) => p.featured) ?? plans[0])?.id;
  return (
    <EditablePage editing={!!editor} page="pricing" label="Pricing" values={c}>
    {/* Day or night with the device, in the desk's card language. One lime button: the featured plan's (or the first). */}
    <div className="theme-system flex min-h-dvh flex-col bg-ink text-bone">
      <header className="mx-auto flex w-full max-w-[1040px] items-center justify-between gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
        <Logo />
        <Link href={href} className="inline-flex min-h-11 items-center rounded-[11px] border border-line bg-well px-3.5 text-[12.5px] font-semibold text-bone hover:border-line-2">
          {label}
        </Link>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-4 px-4 pb-12 pt-4 sm:gap-5 sm:px-6 sm:pt-8">
        <header className={`${CARD} flex flex-col gap-2 p-4 sm:p-6`}>
          <p className="flex items-center gap-1.5 text-[11.5px] text-mute">
            <Icon name="card" className="size-[15px]" />
            {billing ? "Plans and prices" : "Free during the beta"}
          </p>
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.03em] sm:text-[28px]"><E k="pricing_title" /></h1>
          <p className="max-w-[65ch] text-[13.5px] leading-6 text-mute"><E k="pricing_intro" /></p>
        </header>
        <ul className={`grid grid-cols-1 gap-4 sm:gap-5 ${planGrid(plans.length)}`}>
          {plans.map((p) => {
            const lit = p.id === lime;
            return (
              <li key={p.id} className={`${CARD} flex flex-col gap-3 p-4 sm:p-5 ${p.featured ? "border-lime/40" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[15px] font-semibold tracking-[-0.015em]">{p.name}</h2>
                  {p.featured && <Chip tone="acc">More room</Chip>}
                </div>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[34px] font-semibold leading-none tracking-[-0.035em] tnum">
                    {billing && p.price > 0 ? (discountNow(p) ? <>${afterDiscount(p.price, discountNow(p))} <s className="text-[14px] font-normal text-faint">${p.price}</s></> : `$${p.price}`) : "Free"}
                  </span>
                  <span className="text-[12px] text-mute">{p.price > 0 ? (billing ? "/ month" : "during the beta") : "for good"}</span>
                </p>
                <dl className="flex flex-col gap-1 border-t border-dashed border-line-2 pt-3">
                  <dt className="sr-only">Room</dt>
                  <dd className="text-[13px] font-semibold tnum">{p.limit.toLocaleString("en")} active tracks</dd>
                  {p.blurb && <dd className="text-[12px] leading-5 text-mute">{p.blurb}</dd>}
                </dl>
                <ul className="flex flex-1 flex-col gap-2 text-[13px] leading-5">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Icon name="check" className="mt-px size-4 text-lime" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={href}
                  className={`mt-1 inline-flex min-h-11 items-center justify-center rounded-[13px] px-4 text-[13px] font-semibold ${lit ? "bg-lime text-ink hover:brightness-95" : "border border-line bg-well text-bone hover:border-line-2"}`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-[12px] text-faint">
          <Link href="/" className="tap-text underline underline-offset-4 hover:text-bone"><E k="pricing_back" /></Link>
        </p>
      </main>
    </div>
    </EditablePage>
  );
}
