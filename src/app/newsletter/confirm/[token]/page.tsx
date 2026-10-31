import Link from "next/link";
import { MessagePage, PRIMARY } from "@/app/_ui/MessagePage";
import { confirmSubscription } from "@/lib/newsletter";

export const metadata = { title: "Newsletter — FloorTest", robots: { index: false } };

export default async function Confirm({ params }: { params: Promise<{ token: string }> }) {
  const ok = await confirmSubscription((await params).token.slice(0, 64));
  return (
    <MessagePage
      icon={ok ? "check" : "link"}
      tone={ok ? "ok" : "off"}
      title={ok ? "You're subscribed" : "That link didn't work"}
      actions={
        <Link href="/" className={PRIMARY}>
          Back to FloorTest
        </Link>
      }
    >
      <p>{ok ? "Thanks. Every email has a link to unsubscribe in one click." : "It may have been used already, or you unsubscribed. Sign up again from the home page."}</p>
    </MessagePage>
  );
}
