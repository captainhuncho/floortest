import Link from "next/link";
import { MessagePage, PRIMARY, SECONDARY } from "./_ui/MessagePage";

/** Any address with nothing on it. The same answer whether it never existed, moved or was taken down. */
export default function NotFound() {
  return (
    <MessagePage
      icon="search"
      tone="off"
      title="Nothing on this link"
      actions={
        <>
          <Link href="/" className={PRIMARY}>
            Go to FloorTest
          </Link>
          <Link href="/dashboard/floor" className={SECONDARY}>
            Your desk
          </Link>
        </>
      }
    >
      <p>The page may have moved, or the link name was changed. Check the address and try again.</p>
    </MessagePage>
  );
}
