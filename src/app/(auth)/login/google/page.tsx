import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { GOOGLE_LINK_COOKIE, readPendingLink } from "@/lib/google-auth";
import { AuthForm } from "../../AuthForm";
import { approveGoogleLink } from "../../actions";

export const metadata = { title: "Connect Google — FloorTest" };

/** First Google sign-in on an existing account: the owner confirms with their password. */
export default async function ConnectGoogle() {
  const pending = readPendingLink((await cookies()).get(GOOGLE_LINK_COOKIE)?.value, env.secret);
  if (!pending) redirect("/login");
  return (
    <>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight lg:text-[40px] lg:leading-[44px] lg:tracking-[-1.2px]">Connect Google</h1>
      <p className="mb-6 text-sm text-mute">
        <span className="text-bone">{pending.email}</span> already has a FloorTest account. Enter its password once to connect Google; after that, Google signs you straight in. We&apos;ll email you to confirm.
      </p>
      <AuthForm
        action={approveGoogleLink}
        submit="Connect and log in"
        fields={[{ name: "password", label: "FloorTest password", type: "password", autoComplete: "current-password" }]}
      />
      <p className="mt-6 text-center text-sm text-mute">
        No password?{" "}
        <Link href="/login/code" className="text-bone underline underline-offset-4">
          Log in with an email code
        </Link>
        , then connect Google in Settings → Security.
      </p>
    </>
  );
}
