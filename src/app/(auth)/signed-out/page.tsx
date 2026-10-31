import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Signed out — FloorTest", robots: { index: false } };

/** Where signing out lands: confirms the session really ended on this device. */
export default async function SignedOut() {
  if (await currentUser()) redirect("/dashboard/floor");
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <h1 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] text-bone">You&apos;re signed out</h1>
          <p className="text-[13px] text-mute">Your session on this device has ended. Sign in again to return to your music desk.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Link href="/login" className="btn-lime min-h-12 w-full rounded-[13px] text-[14px]">
          Sign in again
        </Link>
        <Link href="/" className="flex min-h-12 w-full items-center justify-center rounded-[13px] border border-line bg-well text-[14px] font-semibold text-bone hover:bg-ink-4">
          Back to home
        </Link>
      </div>
    </div>
  );
}
