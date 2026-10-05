import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { NavIcon } from "@/components/NavIcon";

export const metadata = { title: "Signed out — FloorTest", robots: { index: false } };

/** Where signing out lands: confirms the session really ended on this device. */
export default async function SignedOut() {
  if (await currentUser()) redirect("/dashboard/floor");
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <span aria-hidden className="grid size-11 place-items-center rounded-lg bg-ink-3 text-lime">
          <NavIcon name="signOut" className="size-5" />
        </span>
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight lg:text-[40px] lg:leading-[44px] lg:tracking-[-1.2px]">You&apos;re signed out</h1>
          <p className="text-mute lg:text-base">Your session on this device has ended. Sign in again to return to your music desk.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Link href="/login" className="btn-lime h-[52px] w-full">
          Sign in again
        </Link>
        <Link href="/" className="btn-ghost h-[52px] w-full">
          Back to home
        </Link>
      </div>
    </div>
  );
}
