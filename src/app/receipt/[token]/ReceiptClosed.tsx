import Link from "next/link";
import { MAIN, ShortScreen } from "./ReceiptParts";

/**
 * A receipt link 90 days after the track's final outcome (src/lib/receipt-life.ts). Only that it closed: no track,
 * receiver or dates. The sender's own history (/sent, by confirmed email) still has the full record.
 */
export function ReceiptClosed() {
  return (
    <ShortScreen
      status="closed"
      title="This receipt has closed"
      action={
        <Link href="/sent" className={MAIN}>
          Email me my sends
        </Link>
      }
    >
      <p>Receipt links close 90 days after a track&apos;s journey ends. Your sends are still in your history.</p>
    </ShortScreen>
  );
}
