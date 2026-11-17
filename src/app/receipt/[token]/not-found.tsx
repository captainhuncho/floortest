import Link from "next/link";
import { MAIN, ShortScreen } from "./ReceiptParts";

/** A receipt link that doesn't open. One answer whether it was mistyped or the track was removed. */
export default function NoReceipt() {
  return (
    <ShortScreen
      status="closed"
      title="This receipt isn't available"
      action={
        <Link href="/sent" className={MAIN}>
          Email me my sends
        </Link>
      }
    >
      <p>The link may be cut short, or the track was removed. You can email yourself a private link to every track you&apos;ve sent.</p>
    </ShortScreen>
  );
}
