import Link from "next/link";
import { MessagePage, PRIMARY } from "@/app/_ui/MessagePage";

/**
 * A receipt link 90 days after the track's final outcome (src/lib/receipt-life.ts). Only that it closed: no track,
 * receiver or dates. The sender's own history (/sent, by confirmed email) still has the full record.
 */
export function ReceiptClosed() {
  return (
    <MessagePage
      icon="link"
      tone="off"
      title="This receipt has closed"
      actions={
        <Link href="/sent" className={PRIMARY}>
          Email me my sends
        </Link>
      }
    >
      <p>Receipt links close 90 days after a track&apos;s journey ends. Your sends are still in your history.</p>
    </MessagePage>
  );
}
