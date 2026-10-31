import Link from "next/link";
import { Logo } from "@/components/Logo";
import { CARD } from "@/components/Kit";

/**
 * Sign in, sign up, recovery and signed out: one calm, centred column (owner, 31 Oct). The FloorTest mark, then the
 * form in a card, centred in the screen on tall screens (min-height, never a fixed height, so a phone keyboard can
 * push it up and the page still scrolls); one quiet row of legal links under it. Light or dark with the visitor's device.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="theme-system flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink px-3.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-bone sm:px-6">
      <Logo href="/" />
      <div className={`${CARD} w-full max-w-[460px] p-4 sm:p-5`}>{children}</div>
      <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-5 text-[11.5px] text-mute">
        <Link href="/terms" className="tap inline-flex min-h-11 items-center hover:text-bone">Terms</Link>
        <Link href="/privacy" className="tap inline-flex min-h-11 items-center hover:text-bone">Privacy</Link>
        <Link href="/cookies" className="tap inline-flex min-h-11 items-center hover:text-bone">Cookies</Link>
        <a href="#cookie-settings" className="tap inline-flex min-h-11 items-center hover:text-bone">Cookie settings</a>
      </nav>
    </main>
  );
}
