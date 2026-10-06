import Link from "next/link";
import { Logo } from "@/components/Logo";
import { confirmSubscription } from "@/lib/newsletter";

export const metadata = { title: "Newsletter — FloorTest", robots: { index: false } };

export default async function Confirm({ params }: { params: Promise<{ token: string }> }) {
  const ok = await confirmSubscription((await params).token.slice(0, 64));
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4">
      <Logo />
      <h1 className="text-2xl font-bold">{ok ? "You're subscribed." : "That link didn't work."}</h1>
      <p className="text-mute">{ok ? "Thanks. Every email has a link to unsubscribe in one click." : "It may have been used already, or you unsubscribed. Sign up again from the home page."}</p>
      <Link href="/" className="btn-ghost btn-sm w-fit">Back to FloorTest</Link>
    </main>
  );
}
