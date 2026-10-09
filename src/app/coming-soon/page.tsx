import Link from "next/link";
import { GateForm } from "./GateForm";
import { SignInDialog } from "./SignInDialog";

export const metadata = { title: "FloorTest · Coming soon", robots: { index: false, follow: false } };

/** What floortest.app shows while the site is password-gated (see src/lib/site-gate.ts). */
export default async function ComingSoon({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-16">
      <div className="flex items-center gap-4">
        <img src="/brand/crest.svg" alt="" aria-hidden className="size-14 shrink-0 sm:size-16" />
        <span className="text-[34px] font-extrabold tracking-[-1px] sm:text-[44px]">FloorTest</span>
      </div>
      <h1 className="mt-8 inline-flex w-fit items-center gap-2 rounded-full border border-lime/50 bg-lime/10 px-4 py-1.5 text-sm font-bold text-lime">
        <span aria-hidden className="size-2 animate-pulse rounded-full bg-lime motion-reduce:animate-none" />
        Coming soon
      </h1>
      {/* What FloorTest is, readable without the password (Google's sign-in review needs this on the home page). */}
      <p className="mt-6 text-lg leading-relaxed text-bone">
        FloorTest is a private receiving desk for unreleased music. DJs, curators and labels share one link; artists upload their original
        tracks to it; the receiver listens, decides and downloads the ones they&apos;ll play, and the artist sees what happened to their music.
      </p>
      <p className="mt-3 text-sm text-mute">
        You can sign in with your email and password, an emailed code, or your Google account. With Google we only use your name and email address to sign you in.
      </p>
      <p className="mt-6 text-mute">We&apos;re in a private beta. If you&apos;ve been invited to look around, enter the password.</p>
      <GateForm next={next} />
      <div className="mt-6">
        <SignInDialog />
      </div>
      <nav aria-label="Legal" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 text-sm text-mute">
        <Link href="/privacy" className="underline underline-offset-4 hover:text-bone">Privacy Policy</Link>
        <Link href="/terms" className="underline underline-offset-4 hover:text-bone">Terms of Use</Link>
        <Link href="/cookies" className="underline underline-offset-4 hover:text-bone">Cookies</Link>
      </nav>
    </main>
  );
}
