import Link from "next/link";
import type { User } from "@/lib/db";
import { gettingStarted } from "@/lib/getting-started";
import { dismissOnboarding } from "../actions/desk";
import { SkLine } from "@/components/Skeleton";

const CARD = "rounded-[18px] border border-line bg-card p-3 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]";

/**
 * Getting started (Desk, 13 Nov; laid out as option 41's new desk, 17 Nov): five steps that tick themselves off from
 * what the account owner has done. Each open step is a row that goes where it's done; sharing happens from the link row. The page shows it only to the owner on their own desk (never in View as, never to
 * members). Gone once all five are done, once hidden, or 30 days after sign-up (src/lib/getting-started.ts).
 */
export async function Onboarding({ user }: { user: User }) {
  const steps = await gettingStarted(user.id, user.handle);
  if (!steps) return null;
  const done = steps.filter((s) => s.done).length;

  return (
    <section aria-labelledby="start-h" className={CARD}>
      <div className="flex min-h-11 items-center justify-between gap-3 px-1">
        <h2 id="start-h" className="text-[15px] font-semibold text-bone">
          Getting started
        </h2>
        <div className="flex items-center gap-1">
          <span
            role="progressbar"
            aria-label="Getting started"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
            aria-valuetext={`${done} of ${steps.length} done`}
            className="text-[12px] text-mute tnum"
          >
            {done} of {steps.length}
          </span>
          <form action={dismissOnboarding}>
            <button className="tap-text min-h-11 rounded-[10px] px-2.5 text-[12px] text-mute hover:text-bone">Hide this</button>
          </form>
        </div>
      </div>
      {/* One plain row per step, as drawn in option 41: a ring (ticked when done), the step and one grey line, then Done or an arrow. */}
      <ol className="flex flex-col divide-y divide-line">
        {steps.map((s) => {
          const ring = (
            <span aria-hidden className={`grid size-[22px] shrink-0 place-items-center rounded-full ${s.done ? "bg-lime text-ink" : "border-[1.5px] border-line-2"}`}>
              {s.done && (
                <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5l3.2 3L13 4.5" />
                </svg>
              )}
            </span>
          );
          const text = (
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={`text-[13px] font-semibold ${s.done ? "text-mute" : "text-bone"}`}>
                {s.label}
                {s.done && <span className="sr-only"> (done)</span>}
              </span>
              {!s.done && <span className="text-[12px] leading-snug text-faint">{s.hint}</span>}
            </span>
          );
          return (
            <li key={s.id}>
              {s.done ? (
                <div className="flex min-h-14 items-center gap-3 px-1 py-2">
                  {ring}
                  {text}
                  <span aria-hidden className="shrink-0 text-[12px] text-mute">
                    Done
                  </span>
                </div>
              ) : (
                <Link href={s.href} className="flex min-h-14 items-center gap-3 rounded-[12px] px-1 py-2 hover:bg-well">
                  {ring}
                  {text}
                  <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3.5l4.5 4.5L6 12.5" />
                  </svg>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The card's shape while its one query runs. */
export function OnboardingSkeleton() {
  return (
    <div aria-hidden className={CARD}>
      <SkLine className="h-4 w-32" />
      <div className="mt-3 flex flex-col gap-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkLine key={i} className="h-4 w-3/4" />
        ))}
      </div>
    </div>
  );
}
