import { Logo } from "@/components/Logo";
import { CARD } from "@/components/Kit";
import { SiteFooter } from "./SiteFooter";

/**
 * Sign in, sign up, recovery and signed out: one calm, centred column (owner, 31 Oct). The FloorTest mark, then the
 * form in a card, centred in the screen on tall screens (min-height, never a fixed height, so a phone keyboard can
 * push it up and the page still scrolls); the site's own footer below. Light or dark with the visitor's device.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-system flex min-h-dvh flex-col bg-ink px-3.5 text-bone sm:px-6">
      <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[460px] flex-col items-center justify-center gap-5 pb-6 pt-[max(2rem,env(safe-area-inset-top))]">
        <Logo href="/" />
        <div className={`${CARD} w-full p-4 sm:p-5`}>{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
