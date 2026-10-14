import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canMarkPlayedOut, playedOutStatus } from "@/lib/played-out-prompt";
import type { Row } from "../TrackList";
import { KeptCardsList } from "./KeptCardsList";

/**
 * Prepare's kept tracks with their Played out status. DJ desks (owner and A&R / Admin) can mark one here any day,
 * or go to the pick page for several at once.
 */
export async function KeptCards({ rows }: { rows: Row[] }) {
  const user = await requireUser();
  const canMark = canMarkPlayedOut(user);
  const status = await playedOutStatus(user.id, rows.map((r) => r.id));
  return (
    <>
      {canMark && rows.length > 0 && (
        <p className="mb-2.5 flex justify-end">
          <Link href="/dashboard/played-out" className="tap-text text-[12px] font-medium text-bone underline underline-offset-4 hover:text-lime">
            Mark what I played
          </Link>
        </p>
      )}
      <KeptCardsList rows={rows} status={status} canMark={canMark} />
    </>
  );
}
