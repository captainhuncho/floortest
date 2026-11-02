import { ConfirmByPost } from "@/app/_ui/ConfirmByPost";
import { leaveNewsletter } from "./actions";

export const metadata = { title: "Newsletter — FloorTest", robots: { index: false } };

/**
 * The unsubscribe link in every newsletter email. Opening it shows a button; only pressing it unsubscribes, so a mail
 * scanner opening the link can't (Safety, 2 Nov; account emails' /unsubscribe/… already asks first).
 */
export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.slice(0, 64);
  return (
    <ConfirmByPost
      action={leaveNewsletter.bind(null, token)}
      icon="check"
      ask={{ title: "Unsubscribe from the newsletter?", body: "You'll stop getting the FloorTest newsletter. Nothing else changes." }}
      button="Unsubscribe"
      done={{ title: "You're unsubscribed", body: "You won't get the FloorTest newsletter any more. Changed your mind? Sign up again from the home page." }}
      failed={{ title: "That link didn't work", body: "Check the link in the email and try again." }}
    />
  );
}
