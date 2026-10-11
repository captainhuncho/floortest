import "server-only";
import { now, q, type Collection, type Track, type User } from "./db";
import { featureOn } from "./features";

/** Teammates per shared collection. */
export const MAX_MEMBERS = 10;

export type Member = { id: number; name: string; handle: string };
export type Vote = { user_id: number; name: string; vote: "keep" | "pass"; note: string; created_at: number };

export const members = (collectionId: number) =>
  q.all<Member>(
    "SELECT u.id, u.name, u.handle FROM collection_members m JOIN users u ON u.id = m.user_id WHERE m.collection_id = ? AND u.suspended_at IS NULL ORDER BY m.added_at",
    collectionId,
  );

/** Sharing only works while the owner's plan includes it; downgrading pauses access without losing the list. */
async function ownerShares(ownerId: number) {
  const o = await q.get<{ id: number; plan: string }>("SELECT id, plan FROM users WHERE id = ? AND suspended_at IS NULL", ownerId);
  return !!o && (await featureOn("shared", o));
}

/** Collections other people shared with this user, with the owner's name. */
export async function sharedWith(userId: number) {
  const rows = await q.all<Collection & { owner_name: string; owner_plan: string; count: number; unvoted: number }>(
    `SELECT c.*, u.name AS owner_name, u.plan AS owner_plan,
            (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL AND t.created_at >= m.added_at) AS count,
            (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL AND t.created_at >= m.added_at
               AND NOT EXISTS (SELECT 1 FROM track_votes v WHERE v.track_id = t.id AND v.user_id = ?)) AS unvoted
     FROM collection_members m JOIN collections c ON c.id = m.collection_id JOIN users u ON u.id = c.user_id
     WHERE m.user_id = ? AND u.suspended_at IS NULL ORDER BY m.added_at`,
    userId,
    userId,
  );
  const out = [];
  for (const r of rows) if (await featureOn("shared", { id: r.user_id, plan: r.owner_plan })) out.push(r);
  return out;
}

/** A collection this user can open as a teammate. */
export async function memberCollection(userId: number, collectionId: number) {
  if (!Number.isSafeInteger(collectionId)) return undefined;
  const c = await q.get<Collection & { owner_name: string; added_at: number }>(
    `SELECT c.*, u.name AS owner_name, m.added_at FROM collection_members m JOIN collections c ON c.id = m.collection_id JOIN users u ON u.id = c.user_id
     WHERE m.user_id = ? AND c.id = ?`,
    userId,
    collectionId,
  );
  return c && (await ownerShares(c.user_id)) ? c : undefined;
}

/**
 * A track in a collection shared with this user (listen and vote only). Only tracks sent after they were added:
 * the sender saw them listed on the send page.
 */
export async function memberTrack(userId: number, trackId: number) {
  if (!Number.isSafeInteger(trackId)) return undefined;
  const t = await q.get<Track>(
    `SELECT t.* FROM tracks t JOIN collection_members m ON m.collection_id = t.collection_id
     WHERE t.id = ? AND m.user_id = ? AND t.deleted_at IS NULL AND t.created_at >= m.added_at`,
    trackId,
    userId,
  );
  return t && (await ownerShares(t.user_id)) ? t : undefined;
}

export async function addMember(owner: User, c: Pick<Collection, "id">, who: string): Promise<string | null> {
  if (!(await featureOn("shared", owner))) return "Shared collections are part of the Team plan.";
  const key = who.trim().replace(/^@/, "").toLowerCase();
  if (!key) return "Enter a FloorTest link name or email.";
  const u = await q.get<{ id: number }>("SELECT id FROM users WHERE (handle = ? OR lower(email) = ?) AND suspended_at IS NULL", key, key);
  if (!u) return "No FloorTest account with that link name or email. Ask them to sign up first.";
  if (u.id === owner.id) return "That's you.";
  if ((await members(c.id)).length >= MAX_MEMBERS) return `A collection can have up to ${MAX_MEMBERS} teammates.`;
  await q.run("INSERT INTO collection_members (collection_id, user_id, added_at) VALUES (?,?,?) ON CONFLICT DO NOTHING", c.id, u.id, now());
  return null;
}

export const removeMember = (collectionId: number, userId: number) =>
  q.run("DELETE FROM collection_members WHERE collection_id = ? AND user_id = ?", collectionId, userId);

export const votesFor = (trackId: number) =>
  q.all<Vote>(
    "SELECT v.user_id, u.name, v.vote, v.note, v.created_at FROM track_votes v JOIN users u ON u.id = v.user_id WHERE v.track_id = ? ORDER BY v.created_at",
    trackId,
  );

export async function castVote(userId: number, t: Track, vote: "keep" | "pass", note: string) {
  await q.run(
    `INSERT INTO track_votes (track_id, user_id, vote, note, created_at) VALUES (?,?,?,?,?)
     ON CONFLICT (track_id, user_id) DO UPDATE SET vote = excluded.vote, note = excluded.note, created_at = excluded.created_at`,
    t.id,
    userId,
    vote,
    note.trim().slice(0, 500),
    now(),
  );
}

/** Who besides the receiver hears tracks sent to this collection, shown to senders before they send. */
export async function listeners(c: Collection | undefined) {
  return c && (await ownerShares(c.user_id)) ? members(c.id) : [];
}

/** Keep and pass counts per track, for the owner's lists. */
export async function voteTally(trackIds: number[]) {
  if (!trackIds.length) return new Map<number, string>();
  const rows = await q.all<{ track_id: number; keep: number; pass: number }>(
    `SELECT track_id, COUNT(CASE WHEN vote = 'keep' THEN 1 END) AS keep, COUNT(CASE WHEN vote = 'pass' THEN 1 END) AS pass
     FROM track_votes WHERE track_id IN (${trackIds.map(() => "?").join(",")}) GROUP BY track_id`,
    ...trackIds,
  );
  return new Map(rows.map((r) => [r.track_id, `Team ${r.keep} keep · ${r.pass} pass`]));
}

/**
 * Review Together: who may review this track. The owner always; a teammate only on tracks sent after they joined (and
 * while the owner's plan includes sharing). Returns the track and the reviewer's role, or undefined.
 */
export async function reviewTrack(userId: number, trackId: number) {
  if (!Number.isSafeInteger(trackId)) return undefined;
  const own = await q.get<Track>("SELECT * FROM tracks WHERE id = ? AND user_id = ? AND deleted_at IS NULL", trackId, userId);
  if (own) return { track: own, role: "owner" as const };
  const t = await memberTrack(userId, trackId);
  return t ? { track: t, role: "member" as const } : undefined;
}

export type Comment = { id: number; user_id: number; name: string; body: string; created_at: number };

export const commentsFor = (trackId: number) =>
  q.all<Comment>(
    "SELECT c.id, c.user_id, u.name, c.body, c.created_at FROM track_comments c JOIN users u ON u.id = c.user_id WHERE c.track_id = ? ORDER BY c.created_at LIMIT 200",
    trackId,
  );

export async function addComment(userId: number, t: Pick<Track, "id">, body: string) {
  const text = body.trim().slice(0, 1000);
  if (!text) return;
  await q.run("INSERT INTO track_comments (track_id, user_id, body, created_at) VALUES (?,?,?,?)", t.id, userId, text, now());
}

/** Only the person who wrote a comment can remove it. */
export const removeComment = (userId: number, commentId: number) => q.run("DELETE FROM track_comments WHERE id = ? AND user_id = ?", commentId, userId);

export const shortlistOf = (trackId: number) =>
  q.get<{ user_id: number; name: string; created_at: number }>(
    "SELECT s.user_id, u.name, s.created_at FROM track_shortlist s JOIN users u ON u.id = s.user_id WHERE s.track_id = ?",
    trackId,
  );

/** One shared shortlist per collection: anyone reviewing can add a track or take it off. */
export async function toggleShortlist(userId: number, t: Pick<Track, "id">) {
  const off = await q.run("DELETE FROM track_shortlist WHERE track_id = ?", t.id);
  if (!off.changes) await q.run("INSERT INTO track_shortlist (track_id, user_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING", t.id, userId, now());
  return !off.changes;
}

/** How many teammates review this collection (the owner's panel shows team tools only when there are some). */
export const teamSize = async (collectionId: number | null) =>
  collectionId ? Number((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM collection_members WHERE collection_id = ?", collectionId))?.n ?? 0) : 0;
