import Link from "next/link";
import { activeCollection } from "@/lib/core";
import { q, type User } from "@/lib/db";
import { dismissOnboarding } from "../actions";

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
    { done: await has("SELECT 1 FROM tracks WHERE user_id = ? AND decision IS NOT NULL LIMIT 1"), label: "Make your first decision", hint: "Play a track, then Keep or Not for me.", href: "/dashboard?view=queue" },
    {
      done: await has("SELECT 1 FROM account_log WHERE user_id = ? AND action IN ('exported','downloaded') LIMIT 1"),
      label: "Take kept tracks to your set",
      hint: "Download a crate from Prepare for set.",
      href: "/dashboard/set",
    },
    { done: !!user.totp_enabled_at, label: "Protect your account (optional)", hint: "Turn on two-factor sign-in.", href: "/dashboard/settings#security-h" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <section aria-labelledby="onboard-h" className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="onboard-h" className="text-lg font-semibold">
          Get your desk running <span className="text-sm font-normal text-mute">· {doneCount} of {steps.length}</span>
        </h2>
        <form action={dismissOnboarding}>
          <button className="text-sm text-mute hover:text-bone">Hide this</button>
        </form>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-sm bg-line">
        <div className="h-full bg-lime" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => {
          const body = (
            <>
              <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-sm border text-xs ${s.done ? "border-lime bg-lime text-ink" : "border-line"}`}>
                {s.done ? "✓" : ""}
              </span>
              <span>
                <span className={`block text-sm font-medium ${s.done ? "text-mute line-through" : ""}`}>{s.label}</span>
                {!s.done && <span className="block text-xs text-mute">{s.hint}</span>}
              </span>
            </>
          );
          return (
            <li key={s.label}>
              {s.href && !s.done ? (
                <Link href={s.href} className="flex gap-3 rounded-md p-2 hover:bg-ink-3">
                  {body}
                </Link>
              ) : (
                <div className="flex gap-3 p-2">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
