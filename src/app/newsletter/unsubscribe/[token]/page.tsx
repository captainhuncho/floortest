import Link from "next/link";
import { MessagePage, PRIMARY } from "@/app/_ui/MessagePage";
import { unsubscribeNewsletter } from "@/lib/newsletter";

export const metadata = { title: "Newsletter — FloorTest", robots: { index: false } };

export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const ok = await unsubscribeNewsletter((await params).token.slice(0, 64));
  return (
    <MessagePage
      icon={ok ? "check" : "link"}
      tone={ok ? "ok" : "off"}
      title={ok ? "You're unsubscribed" : "That link didn't work"}
      actions={
        <Link href="/" className={PRIMARY}>
          Back to FloorTest
        </Link>
      }
    >
      <p>{ok ? "You won't get the FloorTest newsletter any more. Changed your mind? Sign up again from the home page." : "Check the link in the email and try again."}</p>
    </MessagePage>
  );
}
