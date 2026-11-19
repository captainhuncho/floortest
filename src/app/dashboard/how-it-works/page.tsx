import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/Kit";
import { TOUR_FINISH, TOUR_HABITS, TOUR_STEPS, tourTip } from "@/lib/tour";
import { ACCOUNT_TYPES, isAccountType } from "@/lib/account-types";
import { ReplayTour } from "../Tour";
import { BackToMore } from "./BackToMore";

export const metadata = { title: "How FloorTest works — FloorTest" };

/** A section's title: small, semibold, mute, as in the drawing (option 61 A). */
const LABEL = "text-[13px] font-semibold text-mute";

/** Replay the tour: the quiet button, full width on a phone, beside the intro on a laptop. */
const REPLAY =
  "inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] border border-line bg-card px-3.5 text-[14px] font-semibold text-bone transition hover:border-line-2 lg:w-auto";

/**
 * How FloorTest works (owner, 6 Nov): the tour's steps on one page anyone on a desk can open any time, the tip for the
 * desk's account type, and the habits that get the most out of it. Linked from the sidebar, More and Account.
 * Layout (option 61 A, owner's pick 19 Nov): one numbered list of steps with small pictures, no card per step; on a
 * laptop two columns, steps on the left, Share your link and the habits on the right. Lime only on the Floor button.
 */
export default async function HowItWorks() {
  const user = await requireUser();
  const tip = tourTip(user.kind);
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5 lg:max-w-[1040px]">
        <header className="flex flex-col gap-3">
          <BackToMore />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-mute">Help</p>
              <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">How FloorTest works</h1>
              <p className="mt-2 max-w-[60ch] text-[14px] leading-[1.45] text-mute">
                FloorTest is the receiving desk for new music. People send you tracks through one link, you listen and decide, and they get an honest receipt.
              </p>
            </div>
            <ReplayTour tip={tip} label="Replay the tour" className={REPLAY} />
          </div>
        </header>

        <div className="grid gap-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
          <section aria-labelledby="steps-h">
            <h2 id="steps-h" className={LABEL}>
              Five things to know
            </h2>
            <ol className="mt-1">
              {TOUR_STEPS.map((s, n) => (
                <li key={s.id} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
                  <span aria-hidden className="w-[18px] shrink-0 pt-0.5 text-[13px] font-semibold text-mute tnum">
                    {n + 1}
                  </span>
                  <Image
                    src={s.image}
                    alt={s.alt}
                    width={800}
                    height={500}
                    sizes="(min-width: 1024px) 150px, 88px"
                    className="aspect-[8/5] h-auto w-[88px] shrink-0 rounded-[10px] border border-line bg-well object-cover object-top lg:w-[150px]"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <h3 className="text-[15px] font-semibold leading-[1.3] tracking-[-0.015em] text-bone">
                      <span className="sr-only">{n + 1}. </span>
                      {s.title}
                    </h3>
                    <p className="text-[14px] leading-[1.4] text-bone">{s.lines[0]}</p>
                    <p className="text-[13px] leading-[1.4] text-mute">{s.lines[1]}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-col gap-7">
            <section aria-labelledby="next-h" className="flex flex-col gap-2.5">
              <h2 id="next-h" className={LABEL}>
                {TOUR_FINISH.title}
              </h2>
              <p className="text-[14px] leading-[1.45] text-bone">{TOUR_FINISH.line}</p>
              {tip && (
                <p className="rounded-[12px] border border-line bg-card px-3 py-2.5 text-[14px] leading-[1.45] text-mute">
                  <b className="font-semibold text-bone">For {isAccountType(user.kind) ? ACCOUNT_TYPES[user.kind] : "you"} desks: </b>
                  {tip}
                </p>
              )}
              <Link href="/dashboard/floor" className="btn-lime inline-flex min-h-11 w-full items-center justify-center rounded-[13px] px-4! text-[14px]! font-semibold">
                Get your link from the Floor
              </Link>
            </section>

            <section aria-labelledby="habits-h">
              <h2 id="habits-h" className={LABEL}>
                Get the most out of it
              </h2>
              <ul className="mt-1">
                {TOUR_HABITS.map((h) => (
                  <li key={h.title} className="flex min-h-[60px] items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold leading-[1.3] text-bone">{h.title}</p>
                      <p className="text-[13px] leading-[1.4] text-mute">{h.line}</p>
                    </div>
                    {h.href && (
                      <Link href={h.href} className="tap-text inline-flex min-h-11 shrink-0 items-center gap-0.5 text-[13px] font-semibold text-bone hover:text-lime">
                        {h.link}
                        <Icon name="chev" className="size-3.5" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
