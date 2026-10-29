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
