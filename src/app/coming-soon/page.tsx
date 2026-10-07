import { GateForm } from "./GateForm";
import { SignInDialog } from "./SignInDialog";

export const metadata = { title: "FloorTest · Coming soon", robots: { index: false, follow: false } };

/** What floortest.app shows while the site is password-gated (see src/lib/site-gate.ts). */
export default async function ComingSoon({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-16">
      <div className="flex items-center gap-4">
        <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-lime sm:size-16">
          <span className="size-5 rounded-full bg-ink sm:size-6" />
        </span>
        <span className="text-[34px] font-extrabold tracking-[-1px] sm:text-[44px]">FloorTest</span>
      </div>
      <h1 className="mt-14 text-[44px] font-extrabold uppercase leading-none tracking-[-1.5px] text-lime sm:text-[64px]">Coming soon</h1>
      <p className="mt-5 text-mute">If you&apos;ve been invited to look around, enter the password.</p>
      <GateForm next={next} />
      <div className="mt-6">
        <SignInDialog />
      </div>
    </main>
  );
}
