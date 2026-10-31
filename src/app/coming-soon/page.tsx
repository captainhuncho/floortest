import Link from "next/link";
import { BetaTag } from "@/components/Logo";
import { GateForm } from "./GateForm";
import { SignInDialog } from "./SignInDialog";
import { CARD } from "@/components/Kit";
import { WaitlistDialog } from "./WaitlistDialog";
import { APP_URL } from "@/lib/mail";
import { botCheckKey } from "@/lib/turnstile";

const HOST = APP_URL.replace(/^https?:\/\//, "");

export const metadata = { title: "FloorTest · Coming soon", robots: { index: false, follow: false } };

/** What floortest.app shows while the site is password-gated (see src/lib/site-gate.ts). */
export default async function ComingSoon({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next = "/" }, botKey] = await Promise.all([searchParams, botCheckKey()]);
  return (
    // Light or dark with the device, the card centred like the sender pages; min-height so a phone keyboard can still scroll it.
    <main id="main" className="app-ui theme-system flex min-h-dvh flex-col items-center justify-center bg-ink px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-bone sm:px-6">
      <div className="flex w-full max-w-[460px] flex-col items-center gap-6">
        <Link href="/" className="tap flex w-fit items-center gap-3" aria-label="FloorTest home">
          {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
          <img draggable={false} src="/brand/crest.svg" alt="" aria-hidden className="size-11 shrink-0 sm:size-12" />
          <span className="text-[28px] font-bold tracking-[-0.03em] sm:text-[32px]">FloorTest</span>
          <BetaTag />
        </Link>
        <section aria-labelledby="soon-h" className={`${CARD} flex w-full flex-col gap-1 p-4 sm:p-6`}>
          <h1 id="soon-h" className="flex items-center gap-2 text-[22px] font-semibold tracking-[-0.025em]">
            <span aria-hidden className="size-2 animate-pulse rounded-full bg-lime motion-reduce:animate-none" />
            Coming soon
          </h1>
          <p className="text-[13.5px] leading-6 text-mute">If you&apos;ve been invited to look around, enter the password.</p>
          <GateForm next={next} />
          <WaitlistDialog host={HOST} botCheckKey={botKey} />
          <div className="mt-3 border-t border-line pt-2">
            <SignInDialog />
          </div>
        </section>
      </div>
    </main>
  );
}
