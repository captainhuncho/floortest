import { ConfirmByPost } from "@/app/_ui/ConfirmByPost";
import { confirmNewsletter } from "./actions";

export const metadata = { title: "Newsletter — FloorTest", robots: { index: false } };

/** The newsletter's confirm link. Opening it shows a button; only pressing it subscribes (link-page audit, 2 Nov). */
export default async function Confirm({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.slice(0, 64);
  return (
    <ConfirmByPost
      action={confirmNewsletter.bind(null, token)}
      icon="check"
      ask={{ title: "Confirm your subscription", body: "One more step: press the button to get the FloorTest newsletter." }}
      button="Subscribe"
      done={{ title: "You're subscribed", body: "Thanks. Every email has a link to unsubscribe in one click." }}
      failed={{ title: "That link didn't work", body: "It may have been used already, or you unsubscribed. Sign up again from the home page." }}
    />
  );
}
