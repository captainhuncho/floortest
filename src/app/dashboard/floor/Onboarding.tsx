import Link from "next/link";
import { activeCollection } from "@/lib/desk";
import { q, type User } from "@/lib/db";
import { dismissOnboarding } from "../actions/desk";

/** First-week checklist: each step ticks itself off from what the receiver has actually done. */
export async function Onboarding({ user }: { user: User }) {
  const row = await q.get<{ d: number | null }>("SELECT onboarding_dismissed_at AS d FROM users WHERE id = ?", user.id);
  if (row?.d) return null;
  const c = await activeCollection(user);
  const has = async (sql: string) => !!(await q.get(sql, user.id));
  const steps = [
    { done: !!user.email_verified_at, label: "Confirm your email", hint: "So resets and alerts reach you. Check your inbox.", href: null },
    {
      done: !!(c && (c.brief_wanted || c.genres || c.bpm_min || c.closes_at || c.brief_note)),
      label: "Set your callout brief",
      hint: "Genres, BPM and a closing date tell senders what you want.",
      href: "/dashboard/collections",
    },
    { done: await has("SELECT 1 FROM tracks WHERE user_id = ? LIMIT 1"), label: "Share your link and get a first track", hint: "Post it in your bio, a callout or a DM. Use Copy link at the top.", href: null },
    { done: await has("SELECT 1 FROM tracks WHERE user_id = ? AND decision IS NOT NULL LIMIT 1"), label: "Make your first decision", hint: "Play a track, then Keep or Not for me.", href: "/dashboard/review?view=queue" },
    {
      done: await has("SELECT 1 FROM account_log WHERE user_id = ? AND action IN ('exported','downloaded') LIMIT 1"),
      label: "Take kept tracks to your set",
      hint: "Download a crate from Prepare for set.",
      href: "/dashboard/prepare",
    },
    { done: !!user.totp_enabled_at, label: "Protect your account (optional)", hint: "Turn on two-factor sign-in.", href: "/dashboard/settings#security-h" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  // Figma "Get Your Desk Running": one column, checked steps struck through, open steps carry a hint.
  return (
    <section aria-labelledby="onboard-h" className="rounded-2xl border border-line bg-ink-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="onboard-h" className="text-[11px] font-bold uppercase tracking-[1px] text-bone">
          Get your desk running · {doneCount} of {steps.length}
        </h2>
        <form action={dismissOnboarding}>
          <button className="text-[11px] text-faint hover:text-bone">Hide this</button>
        </form>
      </div>
      <ol className="mt-3 space-y-3">
        {steps.map((s) => {
          const body = (
            <>
              <span aria-hidden className={`mt-px grid size-4 shrink-0 place-items-center rounded border-[1.5px] border-white ${s.done ? "bg-white" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.done && <img src="/icons/check.svg" alt="" className="size-2.5" />}
              </span>
              {s.done ? (
                <span className="min-w-0 flex-1 text-xs font-medium text-faint line-through">{s.label}</span>
              ) : (
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-xs font-bold text-bone">{s.label}</span>
                  <span className="text-[11px] text-faint">{s.hint}</span>
                </span>
              )}
            </>
          );
          return (
            <li key={s.label}>
              {s.href && !s.done ? (
                <Link href={s.href} className="flex items-start gap-2">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-2">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
