import Link from "next/link";
import { MessagePage, PRIMARY } from "@/app/_ui/MessagePage";
import { confirmReopenAlert } from "@/lib/reopen";

export const metadata = { title: "Reopen alert — FloorTest", robots: { index: false } };

/** The link in the "confirm your reopen alert" email (H76). Opening it once arms the alert, like the newsletter's confirm. */
export default async function ConfirmReopen({ params }: { params: Promise<{ token: string }> }) {
  const ok = await confirmReopenAlert((await params).token.slice(0, 64));
  return (
    <MessagePage
      icon={ok ? "bell" : "link"}
      tone={ok ? "ok" : "off"}
      title={ok ? "Reopen alert confirmed" : "That link didn't work"}
      actions={
        <Link href="/" className={PRIMARY}>
          Back to FloorTest
        </Link>
      }
    >
      <p>{ok ? "You'll get one email when the link takes music again. Nothing else." : "It may have been used already, or it's more than 24 hours old. Ask again from the receiver's link."}</p>
    </MessagePage>
  );
}
