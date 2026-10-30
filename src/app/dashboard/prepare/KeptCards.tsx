import { requireUser } from "@/lib/auth";
import { playedOutStatus } from "@/lib/played-out-prompt";
import type { Row } from "../TrackList";
import { KeptCardsList } from "./KeptCardsList";

/**
 * Prepare's kept tracks with their Played out status. DJ desks (owner and A&R / Admin, `canMark`) can mark one here any
 * day; the page's "Mark what I played" goes to the pick page for several at once.
 */
export async function KeptCards({ rows, canMark }: { rows: Row[]; canMark: boolean }) {
  const user = await requireUser();
  const status = await playedOutStatus(user.id, rows.map((r) => r.id));
  return <KeptCardsList rows={rows} status={status} canMark={canMark} />;
}
