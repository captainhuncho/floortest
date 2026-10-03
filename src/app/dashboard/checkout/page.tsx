import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PLAN_FEATURES, PLANS, planOf, type PlanId } from "@/lib/plans";
import { switchOn } from "@/lib/switches";
import { confirmBetaUpgrade } from "../actions";

export const metadata = { title: "Checkout — FloorTest" };

/**
 * Every upgrade goes through here. During the beta a discount takes the total to $0.00 and confirming
 * applies the plan (no card). Once the billing switch is on, the discount goes and the total is
 * charged by card (not connected yet, so the button stays disabled).
 */
export default async function Checkout({ searchParams }: { searchParams: Promise<{ plan?: string; agree?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const id = sp.plan as PlanId;
  if (!Object.hasOwn(PLANS, id) || PLANS[id].price <= planOf(user.plan).price) notFound();
  const billing = await switchOn("billing");
  const p = PLANS[id];
  const usd = (n: number) => `$${n.toFixed(2)}`;
  const price = usd(p.price);
  const due = billing ? p.price : 0;
  const today = new Date();
  const renews = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-5 text-bone sm:px-8 md:py-8">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard/plans" className="text-[11px] font-medium text-faint hover:text-bone">
          ← Plans
        </Link>
        <h1 className="text-[28px] font-bold tracking-[-0.8px] md:text-[32px]">Upgrade to {p.name}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-start md:gap-6">
        <section aria-labelledby="summary-h" className="rounded-xl border border-line bg-ink-2 p-4 md:p-5">
          <h2 id="summary-h" className="label">
            Order summary
          </h2>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <p className="text-[15px] font-bold">FloorTest {p.name}</p>
            <p className="tnum">
              {price}
              <span className="text-[12px] text-mute"> / month</span>
            </p>
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px] text-mute">
            {PLAN_FEATURES[id].map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden className="text-lime">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-mute">{p.name}, monthly</dt>
              <dd className="tnum">{price}</dd>
            </div>
            {!billing && (
              <div className="flex justify-between text-lime">
                <dt>Beta discount</dt>
                <dd className="tnum">−{price}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-[15px] font-bold">
              <dt>Due today</dt>
              <dd className="tnum">{usd(due)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-dim">{billing ? "Prices in US dollars. Any tax due where you live is shown before you pay." : "The beta discount applied automatically. No card needed."}</p>
        </section>

        <section aria-labelledby="pay-h" className="rounded-xl border border-line bg-ink-2 p-4 md:p-5">
          <h2 id="pay-h" className="label">
            {billing ? "Payment" : "Confirm"}
          </h2>

          <div className="mt-3 space-y-2 text-[12px] text-mute">
            <h3 className="font-bold text-bone">How renewal works</h3>
            {billing ? (
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  You&apos;re charged {price} today, and {price} every month after that, starting {renews}.
                </li>
                <li>Your plan renews automatically until you cancel.</li>
                <li>Cancel any time in Account → Plans, online, in a couple of clicks. You keep {p.name} until the end of the month you&apos;ve paid for.</li>
                <li>We email you before any price change. Your tracks are never deleted because you cancel.</li>
              </ul>
            ) : (
              <ul className="list-disc space-y-1 pl-4">
                <li>{p.name} is free for the rest of the beta. Nothing is charged today and nothing renews.</li>
                <li>
                  This is a temporary trial, not a gift or a lifetime plan. After the beta {p.name} costs {price} a month.
                </li>
                <li>Before that, you get at least 30 days&apos; notice by email. You&apos;re only charged if you choose to continue; otherwise you move to Free and keep every track you have.</li>
              </ul>
            )}
          </div>

          {billing ? (
            <>
              <div className="mt-4 rounded-md border border-dashed border-line px-4 py-6 text-center text-[13px] text-mute">Card payments aren&apos;t connected yet.</div>
              <button disabled className="btn-lime mt-4 w-full">
                Pay {price} and upgrade
              </button>
            </>
          ) : (
            <form action={confirmBetaUpgrade.bind(null, id)} className="mt-4 space-y-4">
              <label className="flex items-start gap-2.5 text-[12px]">
                <input type="checkbox" name="agree" required className="mt-0.5 size-4 accent-lime" />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" className="underline underline-offset-4">
                    Terms of Use
                  </Link>{" "}
                  and understand {p.name} is free only during the beta.
                </span>
              </label>
              {sp.agree && (
                <p role="alert" className="text-[12px] text-danger">
                  Tick the box to confirm.
                </p>
              )}
              <button className="btn-lime w-full">Confirm upgrade · {usd(0)}</button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
