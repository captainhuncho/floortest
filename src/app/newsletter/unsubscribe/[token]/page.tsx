import Link from "next/link";
import { Logo } from "@/components/Logo";
import { unsubscribeNewsletter } from "@/lib/newsletter";

export const metadata = { title: "Newsletter — FloorTest", robots: { index: false } };

export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const ok = await unsubscribeNewsletter((await params).token.slice(0, 64));
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4">
      <Logo />
      <h1 className="text-2xl font-bold">{ok ? "You're unsubscribed." : "That link didn't work."}</h1>
      <p className="text-mute">{ok ? "You won't get the FloorTest newsletter any more. Changed your mind? Sign up again from the home page." : "Check the link in the email and try again."}</p>
      <Link href="/" className="btn-ghost btn-sm w-fit">Back to FloorTest</Link>
    </main>
  );
}
