import Link from "next/link";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { siteCopy } from "@/lib/content";
import { afterDiscount, discountNow, offeredPlans, planGrid } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";

export const metadata = { title: "Pricing — FloorTest", alternates: { canonical: "/pricing" } };

/** Plans and prices, off the home page so it stays short. Prices and wording come from Admin → Plans and Site content. */
export default async function Pricing() {
  const [user, plans, c, open] = await Promise.all([currentUser(), offeredPlans(), siteCopy("pricing"), switchOn("open_signup")]);
  const href = user ? "/dashboard/floor" : open ? "/signup" : "/#waitlist";
  const billing = await switchOn("billing");
  return (
    <div className="bg-ink text-bone">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3 py-6">
          <Logo />
          <Link href={href} className="btn-lime btn-sm">
            {user ? "Open desk" : open ? "Get your link" : "Request an invite"}
          </Link>
        </header>
        <main className="py-12">
          <h1 className="text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">{c.pricing_title}</h1>
          <p className="mt-4 max-w-[65ch] text-sm text-mute">{c.pricing_intro}</p>
          <div className={`mt-10 grid grid-cols-1 gap-4 ${planGrid(plans.length)}`}>
            {plans.map((p) => (
              <div key={p.id} className={`flex flex-col rounded-lg border bg-ink-2 p-7 ${p.featured ? "border-lime/40" : "border-white/10"}`}>
                <p className="text-xs uppercase tracking-[0.1em] text-lime">{p.name}</p>
                <p className="mt-8 text-4xl font-bold">
                  {billing && p.price > 0 ? (discountNow(p) ? <>${afterDiscount(p.price, discountNow(p))} <s className="text-base font-normal text-dim">${p.price}</s></> : `$${p.price}`) : "Free"}
                  <span className="ml-2 text-xs font-normal text-dim">{p.price > 0 ? (billing ? "/ month" : "during the beta") : "for good"}</span>
                </p>
                <p className="mt-6 text-lg">{p.limit.toLocaleString("en")} active tracks</p>
                <p className="mt-1 text-sm text-mute">{p.blurb}</p>
                <ul className="mt-5 flex-1 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden className="text-lime">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={href} className="mt-8 w-fit rounded-md bg-lime px-5 py-3 text-xs font-medium uppercase text-ink">
                  {user ? "Open your desk" : open ? "Get started" : "Request an invite"} →
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-8 text-xs text-dim">
            <Link href="/" className="underline underline-offset-4 hover:text-bone">← Back to home</Link>
          </p>
        </main>
      </div>
    </div>
  );
}
