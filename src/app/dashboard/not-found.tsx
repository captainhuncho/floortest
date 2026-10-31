import Link from "next/link";
import { MessageInFrame, PRIMARY } from "../_ui/MessagePage";

/**
 * A desk page for something that isn't there, or isn't yours: one answer for both, so an address can't be used to
 * find out what exists on someone else's desk. The menu stays in place.
 */
export default function DeskNotFound() {
  return (
    <MessageInFrame
      icon="search"
      tone="off"
      title="Nothing here"
      actions={
        <Link href="/dashboard/floor" className={PRIMARY}>
          Back to the Floor
        </Link>
      }
    >
      <p>It may have been deleted, or the link is from another desk. Use the menu to find what you need.</p>
    </MessageInFrame>
  );
}
