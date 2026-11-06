import "server-only";
import { now, q } from "./db";

/**
 * The tour was closed or finished: it never opens by itself again for this person. Takes the signed-in person's own id
 * (never a team desk's), so each teammate gets the tour once and a desk row is never marked. Kept out of the server action
 * so it can be tested without a request (tests/tour.test.ts); the action only works out who the person is.
 */
export async function markTourSeenFor(personId: number) {
  await q.run("UPDATE users SET tour_seen_at = ? WHERE id = ? AND tour_seen_at IS NULL", now(), personId);
}
