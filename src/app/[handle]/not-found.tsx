import Link from "next/link";
import { MessagePage, PRIMARY } from "../_ui/MessagePage";

/**
 * A one-word address that doesn't open: a typo, a link never claimed, or an account closed or suspended. One answer for all
 * of them, so the page can't be used to find out which names have accounts.
 */
export default function NoReceiver() {
  return (
    <MessagePage
      icon="link"
      tone="off"
      title="Nothing on this link"
      actions={
        <Link href="/" className={PRIMARY}>
          Go to FloorTest
        </Link>
      }
    >
      <p>No receiving link or page has this name. Check the spelling, or ask the receiver to send you their link again.</p>
    </MessagePage>
  );
}
