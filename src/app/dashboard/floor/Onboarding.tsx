import Link from "next/link";
import { activeCollection } from "@/lib/desk";
import { q, type User } from "@/lib/db";
import { dismissOnboarding } from "../actions/desk";
import { APP_URL } from "@/lib/mail";
import { ShareKit } from "./ShareKit";
import { ResendVerification } from "../VerifyBanner";

/**
 * First-week checklist: each step ticks itself off from what the receiver has actually done. Until the first track arrives
 * it shows only what gets that track (PRODUCT.md: onboarding's one job is the first track within 48 hours), with the
 * share step opened up into a ready caption and QR; the rest appears once a track has landed.
 */
export async function Onboarding({ user }: { user: User }) {
  const row = await q.get<{ d: number | null }>("SELECT onboarding_dismissed_at AS d FROM users WHERE id = ?", user.id);
  if (row?.d) return null;
  const c = await activeCollection(user);
  const has = async (sql: string) => !!(await q.get(sql, user.id));
  const firstTrack = await has("SELECT 1 FROM tracks WHERE user_id = ? LIMIT 1");
  const all = [
    { done: !!user.email_verified_at, label: "Confirm your email", hint: "So alerts and password resets reach you.", href: null, resend: true },
    c
      ? {
          done: !!(c.brief_wanted || c.genres || c.bpm_min || c.closes_at || c.brief_note),
          label: "Set your callout brief",
          hint: "Genres, BPM and a closing date tell senders what you want.",
          href: "/dashboard/collections",
        }
      : firstTrack
        ? null // Collections are optional: once tracks arrive without one, it isn't a step left to do.
        : {
          done: false,
          label: "Make a collection for your callout",
          hint: "Tracks land in your Review Queue either way; a collection adds a brief and a closing date.",
          href: "/dashboard/collections",
        },
    { done: firstTrack, label: "Share your link and get a first track", hint: "Post it in your bio, a story or a callout. Senders upload the original file; you'll get an email when it lands.", href: null, share: true },
    { done: await has("SELECT 1 FROM tracks WHERE user_id = ? AND decision IS NOT NULL LIMIT 1"), label: "Decide on your first track", hint: "Play a track, then Keep or Not for me.", href: "/dashboard/review?view=queue" },
    {
      done: await has("SELECT 1 FROM account_log WHERE user_id = ? AND action IN ('exported','downloaded') LIMIT 1"),
      label: "Take kept tracks to your set",
      hint: "Download a crate from Prepare.",
      href: "/dashboard/prepare",
    },
    { done: !!user.totp_enabled_at, label: "Protect your account (optional)", hint: "Turn on two-factor sign-in.", href: "/dashboard/settings/security" },
  ].filter((s) => s !== null);
  const steps = firstTrack ? all : all.slice(0, 3);
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  // Figma "Get Your Desk Running": one column, checked steps struck through, open steps carry a hint.
  return (
    <section aria-labelledby="onboard-h" className="rounded-[18px] border border-line bg-card p-3 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="onboard-h" className="text-[15px] font-semibold text-bone">
          Get your desk running · {doneCount} of {steps.length}
        </h2>
        <form action={dismissOnboarding}>
          <button className="text-[11px] text-faint hover:text-bone tap-text">Hide this</button>
        </form>
      </div>
      <ol className="mt-3 space-y-3">
        {steps.map((s) => {
          const body = (
            <>
              <span aria-hidden className={`mt-px grid size-4 shrink-0 place-items-center rounded border-[1.5px] border-bone ${s.done ? "bg-bone text-ink" : ""}`}>
                {s.done && (
                  <svg viewBox="0 0 16 16" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5l3.2 3L13 4.5" />
                  </svg>
                )}
              </span>
              {s.done ? (
                <span className="min-w-0 flex-1 text-xs font-medium text-faint line-through">{s.label}</span>
              ) : (
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-xs font-bold text-bone">{s.label}</span>
                  <span className="text-[11px] text-faint">{s.hint}</span>
                  {"resend" in s && s.resend && <ResendVerification className="text-[11px]" />}
                  {"share" in s && s.share &&<ShareKit link={`${APP_URL}/${user.handle}`} handle={user.handle} />}
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
