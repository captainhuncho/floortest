import Link from "next/link";
import { MessagePage, PRIMARY } from "@/app/_ui/MessagePage";

/** A receipt link that doesn't open. One answer whether it was mistyped or the track was removed. */
export default function NoReceipt() {
  return (
    <MessagePage
      icon="link"
      tone="off"
      title="This receipt isn't available"
      actions={
        <Link href="/sent" className={PRIMARY}>
          Email me my sends
        </Link>
      }
    >
      <p>The link may be cut short, or the track was removed. You can email yourself a private link to every track you&apos;ve sent.</p>
    </MessagePage>
  );
}
