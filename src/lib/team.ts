import "server-only";
import { now, q, type Track, type User } from "./db";
import { teamsOn } from "./account-members";

/**
 * Review Together, folded into account teams: everyone on an account's team (the owner, admins and members, see
 * account-members.ts) comments on the desk's tracks and keeps one shared shortlist. Internal to the team; senders never
 * see it. The old per-collection guest list and votes were retired and their tables dropped (docs/retired.md).
 */

/** How many people besides the owner work this desk (team tools show only when there are some). */
export async function teamSize(accountId: number) {
  if (!(await teamsOn())) return 0;
  return Number((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM account_members WHERE account_id = ?", accountId))?.n ?? 0);
}

/** A track on this desk that the team can talk about. */
export async function reviewTrack(desk: Pick<User, "id">, trackId: number) {
  if (!Number.isSafeInteger(trackId)) return undefined;
  return q.get<Track>("SELECT * FROM tracks WHERE id = ? AND user_id = ? AND deleted_at IS NULL", trackId, desk.id);
}

export type Comment = { id: number; user_id: number; name: string; body: string; created_at: number };

export const commentsFor = (trackId: number) =>
  q.all<Comment>(
    "SELECT c.id, c.user_id, u.name, c.body, c.created_at FROM track_comments c JOIN users u ON u.id = c.user_id WHERE c.track_id = ? ORDER BY c.created_at, c.id LIMIT 200",
    trackId,
  );

/** Comments are signed by the person who wrote them (on a team desk, the actor, not the account). */
export async function addComment(authorId: number, t: Pick<Track, "id">, body: string) {
  const text = body.trim().slice(0, 1000);
  if (!text) return;
  await q.run("INSERT INTO track_comments (track_id, user_id, body, created_at) VALUES (?,?,?,?)", t.id, authorId, text, now());
}

/** The author removes their own comment; the owner and admins can remove anyone's on their desk (override). */
export async function removeComment(desk: Pick<User, "id" | "actor_id" | "role">, commentId: number) {
  if (desk.role === "owner" || desk.role === "admin")
    return q.run("DELETE FROM track_comments WHERE id = ? AND track_id IN (SELECT id FROM tracks WHERE user_id = ?)", commentId, desk.id);
  return q.run("DELETE FROM track_comments WHERE id = ? AND user_id = ?", commentId, desk.actor_id);
}

export const shortlistOf = (trackId: number) =>
  q.get<{ user_id: number; name: string; created_at: number }>(
    "SELECT s.user_id, u.name, s.created_at FROM track_shortlist s JOIN users u ON u.id = s.user_id WHERE s.track_id = ?",
    trackId,
  );

/** One shared shortlist per desk: anyone on the team can add a track or take it off. */
export async function toggleShortlist(personId: number, t: Pick<Track, "id">) {
  const off = await q.run("DELETE FROM track_shortlist WHERE track_id = ?", t.id);
  if (!off.changes) await q.run("INSERT INTO track_shortlist (track_id, user_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING", t.id, personId, now());
  return !off.changes;
}
