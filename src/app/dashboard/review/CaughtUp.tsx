import Link from "next/link";
import { CopyLinkBox } from "../floor/CopyLinkBox";
import { ArrivalFocus } from "../ReviewHandoff";

/**
 * Nothing waiting: the same state whether the Queue opens empty or the last waiting track was just decided.
 * One action: Open Prepare (lime) when something is kept, else the receiving link to share (neutral).
 */
export function CaughtUp({ kept, link }: { kept: number; link: string }) {
  return (
    <div className="rounded-xl border border-line px-6 py-16 text-center">
      <h2 data-caught-up tabIndex={-1} className="text-lg font-bold text-bone outline-none">
        All caught up.
      </h2>
      {kept > 0 ? (
        <>
          <p className="mt-2 text-mute">{kept} kept ready for your set.</p>
          <Link href="/dashboard/prepare" className="btn-lime mt-5">
            Open Prepare
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-mute">Share your link to get more tracks.</p>
          <div className="mx-auto mt-5 max-w-xs">
            <CopyLinkBox link={link} />
          </div>
        </>
      )}
      <ArrivalFocus target="caught-up" />
    </div>
  );
}
