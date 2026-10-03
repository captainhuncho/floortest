import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { PLAN_FEATURES, PLANS, type PlanId } from "@/lib/plans";
import { switchOn } from "@/lib/switches";

export const metadata = { title: "Checkout — FloorTest" };

/**
 * Upgrade checkout: order summary, the renewal terms in plain words, and payment. Card payments
 * aren't connected yet, so the pay button is disabled; with the billing switch off, only admins
 * can open this page (to review it).
 */
export default async function Checkout({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const user = await requireUser();
  const billing = await switchOn("billing");
  const admin = isAdminEmail(user.email);
  if (!billing && !admin) notFound();
  const id = (await searchParams).plan as PlanId;
  if (!Object.hasOwn(PLANS, id) || PLANS[id].price === 0) notFound();
  const p = PLANS[id];
  const price = `$${p.price.toFixed(2)}`;
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

      {!billing && (
        <p role="note" className="rounded-md border border-[#ffb648]/50 bg-[#ffb648]/10 px-4 py-3 text-sm">
          Preview for admins: the billing switch is off and card payments aren&apos;t connected, so nobody else can see this page and nothing can be charged.
        </p>
      )}

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
          <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-[13px]">
            <div className="flex justify-between">
              <span className="text-mute">Due today</span>
              <span className="font-bold tnum">{price}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-mute">Then every month</span>
              <span className="tnum">{price}</span>
            </div>
            <p className="text-[11px] text-dim">Prices in US dollars. Any tax due where you live is shown before you pay.</p>
          </div>
        </section>

        <section aria-labelledby="pay-h" className="rounded-xl border border-line bg-ink-2 p-4 md:p-5">
          <h2 id="pay-h" className="label">
            Payment
          </h2>
          <div className="mt-3 rounded-md border border-dashed border-line px-4 py-6 text-center text-[13px] text-mute">Card payments aren&apos;t connected yet.</div>

          <div className="mt-4 space-y-2 text-[12px] text-mute">
            <h3 className="font-bold text-bone">How renewal works</h3>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                You&apos;re charged {price} today, and {price} every month after that, starting {renews}.
              </li>
              <li>Your plan renews automatically until you cancel.</li>
              <li>Cancel any time in Account → Plans, online, in a couple of clicks. You keep {p.name} until the end of the month you&apos;ve paid for.</li>
              <li>We email you before any price change. Your tracks are never deleted because you cancel.</li>
            </ul>
          </div>

          <label className="mt-4 flex items-start gap-2.5 text-[12px]">
            <input type="checkbox" disabled className="mt-0.5 size-4 accent-lime" />
            <span>
              I agree to the{" "}
              <Link href="/terms" className="underline underline-offset-4">
                Terms of Use
              </Link>{" "}
              and understand my subscription renews monthly at {price} until I cancel.
            </span>
          </label>
          <button disabled className="btn-lime mt-4 w-full">
            Pay {price} and upgrade
          </button>
          <p className="mt-2 text-center text-[11px] text-dim">Secure payment by card. We never see or store your card number.</p>
        </section>
      </div>
    </div>
  );
}
