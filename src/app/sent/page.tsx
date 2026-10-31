import { Logo } from "@/components/Logo";
import { SentForm } from "./SentForm";
import { botCheckKey } from "@/lib/turnstile";
import { CARD } from "@/components/Kit";

export const metadata = { title: "Your sends — FloorTest" };

export default async function Sent() {
  const botKey = await botCheckKey();
  return (
    // Light or dark with the visitor's device, one ~600px column of cards (owner, 30 Oct).
    <main className="theme-system mx-auto flex min-h-dvh max-w-[600px] flex-col gap-3 bg-ink px-3.5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-bone sm:px-6 sm:pt-10">
      <Logo className="mb-3" />
      <section aria-labelledby="sent-h" className={`${CARD} flex flex-col gap-3.5 p-3`}>
        <div>
          <h1 id="sent-h" className="text-[24px] font-semibold leading-tight tracking-[-0.03em] sm:text-[28px]">Everything you&apos;ve sent</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-mute">
            See every track you&apos;ve sent through FloorTest and what happened to it. No account or password: we&apos;ll email you a private link.
          </p>
        </div>
        <SentForm botCheckKey={botKey} />
      </section>
    </main>
  );
}
