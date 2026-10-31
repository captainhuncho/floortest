import { Logo } from "@/components/Logo";
import { SentForm } from "./SentForm";
import { botCheckKey } from "@/lib/turnstile";
import { CARD } from "@/components/Kit";

export const metadata = { title: "Your sends — FloorTest" };

export default async function Sent() {
  const botKey = await botCheckKey();
  return (
    // Light or dark with the visitor's device; the card sits centred in the screen, the mark just above it (owner, 31 Oct).
    // min-height, not a fixed height, so the page still scrolls when a phone keyboard opens.
    <main className="theme-system flex min-h-dvh flex-col items-center justify-center bg-ink px-3.5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-bone sm:px-6">
      <div className="flex w-full max-w-[520px] flex-col items-center gap-5">
      <Logo />
      <section aria-labelledby="sent-h" className={`${CARD} flex w-full flex-col gap-3.5 p-4`}>
        <div>
          <h1 id="sent-h" className="text-[24px] font-semibold leading-tight tracking-[-0.03em] sm:text-[28px]">Everything you&apos;ve sent</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-mute">
            See every track you&apos;ve sent through FloorTest and what happened to it. No account or password: we&apos;ll email you a private link.
          </p>
        </div>
        <SentForm botCheckKey={botKey} />
      </section>
      </div>
    </main>
  );
}
