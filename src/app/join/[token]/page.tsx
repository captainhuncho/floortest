import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { currentPerson } from "@/lib/auth";
import { inviteBySecret, ROLE_LABEL } from "@/lib/account-members";
import { JoinButton } from "./JoinButton";

export const metadata: Metadata = { title: "Join a team — FloorTest", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** A team invite: accept it signed in with the invited email, or log in / create your own login first. */
export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await inviteBySecret(token);
  const me = await currentPerson();
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-[18px] py-10 text-bone">
      <Logo />
      {children}
    </main>
  );
  if (!inv)
    return shell(
      <>
        <h1 className="mt-10 text-[24px] font-bold">This invite isn&apos;t valid any more.</h1>
        <p className="mt-2 text-mute">It may have expired (invites last 7 days), been cancelled or already used. Ask for a new one.</p>
      </>,
    );
  const head = (
    <>
      <h1 className="mt-10 text-[24px] font-bold leading-tight">Join {inv.account_name} on FloorTest</h1>
      <p className="mt-2 text-[14px] text-mute">
        You&apos;re invited as {inv.role === "admin" ? "an" : "a"} {ROLE_LABEL[inv.role].toLowerCase()}, to review and reply to the music sent to /{inv.account_handle}. You keep
        your own login and can switch between your desk and theirs.
      </p>
    </>
  );
  if (!me)
    return shell(
      <>
        {head}
        <div className="mt-6 flex flex-col gap-3">
          <a href={`/join/${token}/login`} className="btn-lime">
            Log in with {inv.email}
          </a>
          <a href={`/join/${token}/signup`} className="btn-ghost">
            New to FloorTest? Create your login
          </a>
        </div>
      </>,
    );
  if (me.email.toLowerCase() !== inv.email)
    return shell(
      <>
        {head}
        <p role="alert" className="mt-6 rounded-lg border border-danger/40 p-4 text-[14px]">
          This invite was sent to {inv.email}, but you&apos;re signed in as {me.email}. Sign out and log in with {inv.email} to accept it.
        </p>
      </>,
    );
  return shell(
    <>
      {head}
      <JoinButton token={token} name={inv.account_name} />
    </>,
  );
}
