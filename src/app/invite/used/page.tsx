import type { Metadata } from "next";
import Link from "next/link";
import { MessagePage, PRIMARY } from "@/app/_ui/MessagePage";

export const metadata: Metadata = { title: "Invite used — FloorTest", robots: { index: false, follow: false } };

/**
 * Where a personal beta invite link lands once it can't open an account any more (owner, 5 Nov): used to sign up,
 * past its 14 days, or revoked. One answer for all three, so the page never says which. Open behind the coming-soon
 * gate (it sits under /invite), so the person can still reach Log in.
 */
export default function InviteUsed() {
  return (
    <MessagePage
      icon="link"
      tone="off"
      title="This invite has been used or has expired"
      actions={
        <Link href="/login" className={PRIMARY}>
          Log in
        </Link>
      }
    >
      <p>Each invite link opens one account and lasts 14 days. If you already signed up with it, log in. If not, ask the person who invited you for a new one.</p>
    </MessagePage>
  );
}
