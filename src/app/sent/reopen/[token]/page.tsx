import Link from "next/link";
import { Logo } from "@/components/Logo";
import { confirmReopenAlert } from "@/lib/reopen";
import { CARD } from "@/components/Kit";

export const metadata = { title: "Reopen alert — FloorTest", robots: { index: false } };

/** The link in the "confirm your reopen alert" email (H76). Opening it once arms the alert, like the newsletter's confirm. */
export default async function ConfirmReopen({ params }: { params: Promise<{ token: string }> }) {
  const ok = await confirmReopenAlert((await params).token.slice(0, 64));
  return (
    <main className="theme-system flex min-h-dvh flex-col items-center justify-center bg-ink px-3.5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-bone sm:px-6">
      <div className="flex w-full max-w-[520px] flex-col items-center gap-5">
      <Logo />
      <section className={`${CARD} flex w-full flex-col gap-3 p-4`}>
      <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.03em]">{ok ? "Confirmed." : "That link didn't work."}</h1>
      <p className="text-[13px] leading-5 text-mute">
        {ok ? "You'll get one email when the link takes music again. Nothing else." : "It may have been used already, or it's more than 24 hours old. Ask again from the receiver's link."}
      </p>
      <Link href="/" className="inline-flex min-h-11 w-fit items-center rounded-[11px] border border-line bg-well px-3.5 text-[12.5px] font-semibold text-bone hover:bg-ink-4">
        Back to FloorTest
      </Link>
      </section>
      </div>
    </main>
  );
}
