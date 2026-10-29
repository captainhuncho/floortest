import "server-only";
import { roleOn, teamsOn } from "./account-members";
import { q, USER_COLUMNS, type User } from "./db";

/**
 * The desk a signed-in person works on, from the desk cookie's account id: the team's account row (with them as
 * `actor_id` and their `role`), or their own desk. `stale` when the cookie names a team desk they can't open any more
 * (removed, seat paused, teams switched off, the account suspended): reading falls back to their own desk, but a
 * change must not, or it would land on the wrong desk without them knowing (requireUser stops it).
 */
export async function resolveDesk(person: User, desk: number): Promise<{ user: User; stale: boolean }> {
  if (!Number.isSafeInteger(desk) || desk <= 0 || desk === person.id) return { user: person, stale: false };
  const role = (await teamsOn(desk)) ? await roleOn(desk, person.id) : null;
  const account = role ? await q.get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND suspended_at IS NULL`, desk) : undefined;
  if (!role || !account) return { user: person, stale: true };
  return { user: { ...account, actor_id: person.id, actor_name: person.name, role }, stale: false };
}

/** What a desk API route answers when a change comes from a team desk the person lost: one clear JSON error. */
export const DESK_ENDED_ERROR = "You're no longer on that team's desk. Reload to go back to your own desk, then try again.";

/**
 * For API routes that change something: the desk to change, or a 409 when the desk cookie names a team desk the person
 * lost. Reading may fall back to their own desk; a change never does (the same rule as requireUser for server actions).
 */
export function refuseStaleChange(desk: { user: User; stale: boolean }): User | Response {
  if (!desk.stale) return desk.user;
  return Response.json({ error: DESK_ENDED_ERROR, deskEnded: true }, { status: 409 });
}
