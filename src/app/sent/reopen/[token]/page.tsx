import Link from "next/link";
import { Logo } from "@/components/Logo";
import { confirmReopenAlert } from "@/lib/reopen";

export const metadata = { title: "Reopen alert — FloorTest", robots: { index: false } };

/** The link in the "confirm your reopen alert" email (H76). Opening it once arms the alert, like the newsletter's confirm. */
export default async function ConfirmReopen({ params }: { params: Promise<{ token: string }> }) {
  const ok = await confirmReopenAlert((await params).token.slice(0, 64));
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4">
      <Logo />
      <h1 className="text-2xl font-bold">{ok ? "Confirmed." : "That link didn't work."}</h1>
      <p className="text-mute">
        {ok ? "You'll get one email when the link takes music again. Nothing else." : "It may have been used already, or it's more than 24 hours old. Ask again from the receiver's link."}
      </p>
      <Link href="/" className="btn-ghost btn-sm w-fit">
        Back to FloorTest
      </Link>
    </main>
  );
}
