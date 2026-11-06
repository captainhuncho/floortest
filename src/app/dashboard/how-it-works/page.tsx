import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CARD, Icon, PageHead, SectionHead } from "@/components/Kit";
import { TOUR_FINISH, TOUR_HABITS, TOUR_STEPS, tourTip } from "@/lib/tour";
import { ACCOUNT_TYPES, isAccountType } from "@/lib/account-types";
import { ReplayTour } from "../Tour";

export const metadata = { title: "How FloorTest works — FloorTest" };

/**
 * How FloorTest works (owner, 6 Nov): the tour's steps on one page anyone on a desk can open any time, the tip for the
 * desk's account type, and the habits that get the most out of it. Linked from the sidebar and Account.
 */
export default async function HowItWorks() {
  const user = await requireUser();
  const tip = tourTip(user.kind);
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5">
        <PageHead label="Help" title="How FloorTest works">
          <ReplayTour tip={tip} />
        </PageHead>
        <p className="max-w-[60ch] text-[14px] leading-snug text-mute">
          FloorTest is the receiving desk for new music. People send you tracks through one link, you listen and decide, and they get an honest receipt.
        </p>

        <section aria-labelledby="steps-h" className="flex flex-col gap-3">
          <SectionHead id="steps-h" icon="music" title="Five things to know" />
          <ol className="flex flex-col gap-3">
            {TOUR_STEPS.map((s, n) => (
              <li key={s.id} className={`${CARD} grid gap-3 p-3 sm:grid-cols-[14rem_1fr] sm:items-center`}>
                <Image
                  src={s.image}
                  alt={s.alt}
                  width={800}
                  height={500}
                  sizes="(min-width: 640px) 14rem, 100vw"
                  className="aspect-[8/5] h-auto w-full rounded-[12px] border border-line bg-well object-cover object-top"
                />
                <div className="min-w-0 space-y-1.5 text-[13px] leading-5">
                  <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-bone">
                    <span className="mr-1.5 text-mute">{n + 1}.</span>
                    {s.title}
                  </h3>
                  <p className="text-bone">{s.lines[0]}</p>
                  <p className="text-mute">{s.lines[1]}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="next-h" className={`${CARD} flex flex-col gap-3 p-4`}>
          <SectionHead id="next-h" icon="share" title={TOUR_FINISH.title} />
          <p className="text-[13px] leading-5 text-bone">{TOUR_FINISH.line}</p>
          {tip && (
            <p className="rounded-[12px] border border-line bg-well p-3 text-[13px] leading-5 text-mute">
              <span className="font-semibold text-bone">For {isAccountType(user.kind) ? ACCOUNT_TYPES[user.kind] : "you"} desks: </span>
              {tip}
            </p>
          )}
          <Link href="/dashboard/floor" className="btn-lime inline-flex min-h-11 w-fit items-center rounded-[13px] px-4! text-[13px]! font-semibold">
            Get your link from the Floor
          </Link>
        </section>

        <section aria-labelledby="habits-h" className="flex flex-col gap-3">
          <SectionHead id="habits-h" icon="star" title="Get the most out of it" />
          <ul className={`${CARD} divide-y divide-line`}>
            {TOUR_HABITS.map((h) => (
              <li key={h.title} className="flex flex-col gap-1 p-4 text-[13px] leading-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-bone">{h.title}</p>
                  <p className="text-mute">{h.line}</p>
                </div>
                {h.href && (
                  <Link href={h.href} className="tap-text inline-flex min-h-11 shrink-0 items-center gap-1 text-[12.5px] font-semibold text-bone hover:text-lime">
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
  );
}
