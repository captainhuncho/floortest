import { GateForm } from "./GateForm";
import { SignInDialog } from "./SignInDialog";

export const metadata = { title: "FloorTest · Coming soon", robots: { index: false, follow: false } };

/** What floortest.app shows while the site is password-gated (see src/lib/site-gate.ts). */
export default async function ComingSoon({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  return (
    <main id="main" className="app-ui mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-16">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
        <img src="/brand/crest.svg" alt="" aria-hidden className="size-14 shrink-0 sm:size-16" />
        <span className="text-[34px] font-extrabold tracking-[-1px] sm:text-[44px]">FloorTest</span>
      </div>
      <h1 className="mt-8 inline-flex w-fit items-center gap-2 rounded-full border border-lime/50 bg-lime/10 px-4 py-1.5 text-sm font-bold text-lime">
        <span aria-hidden className="size-2 animate-pulse rounded-full bg-lime motion-reduce:animate-none" />
        Coming soon
      </h1>
      <p className="mt-6 text-mute">If you&apos;ve been invited to look around, enter the password.</p>
      <GateForm next={next} />
      <div className="mt-6">
        <SignInDialog />
      </div>
    </main>
  );
}
