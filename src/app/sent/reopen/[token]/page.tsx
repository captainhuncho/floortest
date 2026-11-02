import { ConfirmByPost } from "@/app/_ui/ConfirmByPost";
import { confirmReopen } from "./actions";

export const metadata = { title: "Reopen alert — FloorTest", robots: { index: false } };

/**
 * The link in the "confirm your reopen alert" email (H76). Opening it shows a button; only pressing it arms the alert, so
 * a mail scanner opening the link can't (link-page audit, 2 Nov).
 */
export default async function ConfirmReopen({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.slice(0, 64);
  return (
    <ConfirmByPost
      action={confirmReopen.bind(null, token)}
      icon="bell"
      ask={{ title: "Confirm your reopen alert", body: "We'll send you one email when the link takes music again. Nothing else." }}
      button="Confirm the alert"
      done={{ title: "Reopen alert confirmed", body: "You'll get one email when the link takes music again. Nothing else." }}
      failed={{ title: "That link didn't work", body: "It may have been used already, or it's more than 24 hours old. Ask again from the receiver's link." }}
    />
  );
}
