import { Logo } from "@/components/Logo";
import { GateForm } from "./GateForm";

export const metadata = { title: "FloorTest · Coming soon", robots: { index: false, follow: false } };

/** What floortest.app shows while the site is password-gated (see src/lib/site-gate.ts). */
export default async function ComingSoon({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center px-5 py-16">
      <Logo href="/" />
      <p className="mt-16 text-[12px] font-medium uppercase tracking-[0.5px] text-lime">Coming soon</p>
      <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-[-0.8px] sm:text-[44px]">The receiving desk for unreleased music.</h1>
      <p className="mt-4 text-mute">FloorTest is getting ready. If you&apos;ve been invited to look around, enter the password.</p>
      <GateForm next={next} />
    </main>
  );
}
