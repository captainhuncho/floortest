import Link from "next/link";
import type { User } from "@/lib/db";
import { gettingStarted } from "@/lib/getting-started";
import { dismissOnboarding } from "../actions/desk";
import { APP_URL } from "@/lib/mail";
import { GHOST_TALL, LIME } from "../kitButtons";
import { SkBlock, SkLine } from "@/components/Skeleton";
import { ShareKit } from "./ShareKit";
import { StartCopy } from "./StartCopy";

const CARD = "rounded-[18px] border border-line bg-card p-3 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]";

/**
 * Getting started (Desk, 13 Nov): five steps that tick themselves off from what the account owner has done, with one
 * lime button for the next one. The page shows it only to the owner on their own desk (never in View as, never to
 * members). Gone once all five are done, once hidden, or 30 days after sign-up (src/lib/getting-started.ts).
 */
export async function Onboarding({ user }: { user: User }) {
  const steps = await gettingStarted(user.id, user.handle);
  if (!steps) return null;
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done)!;
  const link = `${APP_URL}/${user.handle}`;

  return (
    <section aria-labelledby="start-h" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="start-h" className="text-[15px] font-semibold text-bone">
          Getting started
        </h2>
        <span className="text-[12px] text-mute tnum">
          {done} of {steps.length}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Getting started"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${steps.length} done`}
        className="mt-2 h-1 overflow-hidden rounded-full bg-well"
      >
        <div className="h-full rounded-full bg-lime motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-2 flex flex-col">
        {steps.map((s) => {
          const tick = (
            <span aria-hidden className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border-[1.5px] border-bone ${s.done ? "bg-bone text-ink" : ""}`}>
              {s.done && (
                <svg viewBox="0 0 16 16" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5l3.2 3L13 4.5" />
                </svg>
              )}
            </span>
          );
          return (
            <li key={s.id}>
              {s.done ? (
                <div className="flex min-h-11 items-center gap-2.5">
                  {tick}
                  <span className="text-[12px] font-medium text-faint line-through">{s.label}</span>
                  <span className="sr-only">(done)</span>
                </div>
              ) : (
                <>
                  <Link href={s.href} className="flex min-h-11 items-start gap-2.5 rounded-[10px] py-1.5 hover:bg-well">
                    {tick}
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[12px] font-bold text-bone">{s.label}</span>
                      <span className="text-[11.5px] text-faint">{s.hint}</span>
                    </span>
                  </Link>
                  {s.id === "share" && (
                    <div className="pb-1.5 pl-[26px]">
                      <ShareKit link={link} handle={user.handle} />
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {next.id === "share" ? (
          <StartCopy link={link} />
        ) : (
          <Link href={next.href} className={LIME}>
            {next.action}
          </Link>
        )}
        <form action={dismissOnboarding} className="ml-auto">
          <button className={GHOST_TALL}>Hide this</button>
        </form>
      </div>
    </section>
  );
}

/** The card's shape while its one query runs. */
export function OnboardingSkeleton() {
  return (
    <div aria-hidden className={CARD}>
      <SkLine className="h-4 w-32" />
      <SkBlock className="mt-3 h-1 w-full" />
      <div className="mt-3 flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkLine key={i} className="h-4 w-3/4" />
        ))}
      </div>
    </div>
  );
}
