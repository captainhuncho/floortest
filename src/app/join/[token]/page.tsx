import type { Metadata } from "next";
import { MessagePage, PRIMARY, SECONDARY } from "@/app/_ui/MessagePage";
import { logout } from "@/app/(auth)/actions";
import { currentPerson } from "@/lib/auth";
import { inviteBySecret } from "@/lib/account-members";
import { JoinButton } from "./JoinButton";

export const metadata: Metadata = { title: "Join a team — FloorTest", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** A team invite: accept it signed in with the invited email, or log in / create your own login first. */
export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await inviteBySecret(token);
  const me = await currentPerson();
  // One answer for an unknown, expired, cancelled or used invite: the page never says which.
  if (!inv)
    return (
      <MessagePage icon="link" tone="off" title="This invite isn't valid any more">
        <p>It may have expired (invites last 7 days), been cancelled or already used. Ask the person who invited you for a new one.</p>
      </MessagePage>
    );
  const title = `Join ${inv.account_name} on FloorTest`;
  const about = (
    <p>
      You&apos;re invited as {inv.role === "admin" ? "an A&R / Admin" : "a member"}, to review and reply to the music sent to /{inv.account_handle}. You keep your
      own login and can switch between your desk and theirs.
    </p>
  );
  if (!me)
    return (
      <MessagePage
        icon="contacts"
        title={title}
        wide
        stack
        actions={
          <>
            <a href={`/join/${token}/login`} className={PRIMARY}>
              Log in with {inv.email}
            </a>
            <a href={`/join/${token}/signup`} className={SECONDARY}>
              New to FloorTest? Create your login
            </a>
          </>
        }
      >
        {about}
      </MessagePage>
    );
  if (me.email.toLowerCase() !== inv.email)
    return (
      <form action={logout}>
        <MessagePage icon="contacts" title={title} wide actions={<button className={SECONDARY}>Sign out</button>}>
          {about}
          <p role="alert" className="text-bone">
            This invite was sent to {inv.email}, but you&apos;re signed in as {me.email}. Sign out, then open this invite again and log in with {inv.email} to accept it.
          </p>
        </MessagePage>
      </form>
    );
  return (
    <MessagePage icon="contacts" title={title} wide actions={<JoinButton token={token} name={inv.account_name} />}>
      {about}
    </MessagePage>
  );
}
