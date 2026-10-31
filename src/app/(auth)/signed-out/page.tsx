import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthFrame } from "../AuthFrame";

export const metadata = { title: "Signed out — FloorTest", robots: { index: false } };

/** Where signing out lands: confirms the session really ended on this device. */
export default async function SignedOut() {
  if (await currentUser()) redirect("/dashboard/floor");
  return (
    <AuthFrame>
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <h1 className="af-h">You&apos;re signed out</h1>
          <p className="text-[13px] text-mute">Your session on this device has ended. Sign in again to return to your music desk.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Link href="/login" className="af-btn af-prime">
          Sign in again
        </Link>
        <Link href="/" className="af-btn">
          Back to home
        </Link>
      </div>
    </div>
    </AuthFrame>
  );
}
