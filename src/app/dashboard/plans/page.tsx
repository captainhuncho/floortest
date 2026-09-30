import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { capacity } from "@/lib/core";
import { PLANS, RETAIN_UNREVIEWED_DAYS, planOf } from "@/lib/plans";
import { setPlan } from "../actions";

export const metadata = { title: "Plans — FloorTest" };

/** Figma "11 Plans + Storage": usage, then one card per plan. Everything is free during the beta. */
export default async function Plans() {
  const user = await requireUser();
  const cap = await capacity(user);
  const current = planOf(user.plan);
  const card = "flex flex-col gap-1 rounded-xl bg-ink-2 px-3.5 py-3";
  const kicker = "text-[9px] font-medium uppercase tracking-[1px] text-faint";
  return (
    <div className="flex max-w-xl flex-col gap-5 px-4 py-5 font-[family-name:var(--font-stage-mono)] text-bone sm:px-8">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard/account" className={kicker}>
          ← Account
        </Link>
        <h1 className="text-[28px] font-bold tracking-[-0.8px]">Plans</h1>
      </div>
      <div className="flex flex-col gap-3">
        <section className={card}>
          <p className={kicker}>Current usage</p>
          <p className="text-[18px] font-bold uppercase">
            {cap.used} of {cap.limit.toLocaleString()} tracks used
          </p>
          <p className="text-[10px] text-dim">
            {current.name} · unreviewed tracks kept {RETAIN_UNREVIEWED_DAYS} days
            {cap.bonus > 0 && ` · includes ${cap.bonus} from referrals`}
          </p>
        </section>
        {Object.entries(PLANS).map(([id, p]) => {
          const isCurrent = user.plan === id;
          const tooSmall = cap.used > p.limit + cap.bonus;
          return (
            <section key={id} className={`${card} ${id === "pro" ? "border border-[#536400]" : ""}`}>
              <p className={kicker}>{isCurrent ? "Your plan" : id === "pro" ? "Recommended" : "Plan"}</p>
              <p className="text-[18px] font-bold uppercase">{p.name}</p>
              <p className="text-[10px] text-dim">
                {p.price ? `Free during the beta, then $${p.price}/mo` : "$0"} · {p.limit.toLocaleString()} tracks · {p.blurb}
              </p>
              {!isCurrent && (
                <form action={setPlan.bind(null, id)} className="mt-2">
                  <button disabled={tooSmall} className="rounded-full border border-line px-3 py-1 text-[10px] font-bold disabled:opacity-50">
                    {tooSmall ? "Over this plan's limit" : `Switch to ${p.name}`}
                  </button>
                </form>
              )}
            </section>
          );
        })}
        <section className={card}>
          <p className={kicker}>Retention</p>
          <p className="text-[18px] font-bold">Automatic deletion</p>
          <p className="text-[10px] text-dim">Tracks you don&apos;t decide on are deleted after {RETAIN_UNREVIEWED_DAYS} days. Kept tracks stay until you delete them.</p>
        </section>
        {user.plan === "free" && (
          <form action={setPlan.bind(null, "pro")}>
            <button className="rounded-full bg-white px-3.5 py-2 text-[10px] font-bold text-ink">UPGRADE TO PRO · FREE IN BETA</button>
          </form>
        )}
        <p className="text-[10px] text-faint">Billing isn&apos;t connected yet. Plan changes are free during the beta.</p>
      </div>
    </div>
  );
}
