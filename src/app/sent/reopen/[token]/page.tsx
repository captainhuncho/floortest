import Link from "next/link";
import { Logo } from "@/components/Logo";
import { confirmReopenAlert } from "@/lib/reopen";
import { CARD } from "@/components/Kit";

export const metadata = { title: "Reopen alert — FloorTest", robots: { index: false } };

/** The link in the "confirm your reopen alert" email (H76). Opening it once arms the alert, like the newsletter's confirm. */
export default async function ConfirmReopen({ params }: { params: Promise<{ token: string }> }) {
  const ok = await confirmReopenAlert((await params).token.slice(0, 64));
  return (
    <main className="theme-system mx-auto flex min-h-dvh max-w-[600px] flex-col gap-3 bg-ink px-3.5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-bone sm:px-6 sm:pt-10 justify-center">
      <Logo className="mb-3" />
      <section className={`${CARD} flex flex-col gap-3 p-3`}>
      <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.03em]">{ok ? "Confirmed." : "That link didn't work."}</h1>
      <p className="text-[13px] leading-5 text-mute">
        {ok ? "You'll get one email when the link takes music again. Nothing else." : "It may have been used already, or it's more than 24 hours old. Ask again from the receiver's link."}
      </p>
      <Link href="/" className="inline-flex min-h-11 w-fit items-center rounded-[11px] border border-line bg-well px-3.5 text-[12.5px] font-semibold text-bone hover:bg-ink-4">
        Back to FloorTest
      </Link>
      </section>
    </main>
  );
}
