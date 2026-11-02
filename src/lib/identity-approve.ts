import { now, q } from "./db";

/**
 * Approving a person's own verification request (ops → Verification). Only an account whose request is waiting
 * (identity_status = 'pending') can be approved this way; anything else gets the same "not found" answer, so this
 * action can't add the Verified mark to an account that never asked (owner, 1 Nov: staff never verify without a
 * request or proof). Returns who to email, or null.
 */
export async function approvePendingIdentity(userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1) return null;
  return (
    (await q.get<{ email: string; name: string; handle: string }>(
      "UPDATE users SET identity_status = 'verified', identity_verified_at = ?, identity_note = '' WHERE id = ? AND identity_status = 'pending' RETURNING email, name, handle",
      now(),
      userId,
    )) ?? null
  );
}

/**
 * "Not yet" on a person's own verification request (ops → Verification). Like approving, only a request that is waiting
 * can be turned down: a verified account keeps its mark and its verified time (removing it is "Remove verification",
 * with its own email), and any other account gets the same "not found" (Safety review of #358, 2 Nov). Returns who to
 * email and the note it replaced (for Undo), or null.
 */
export async function rejectPendingIdentity(userId: number, note: string) {
  if (!Number.isSafeInteger(userId) || userId < 1) return null;
  return q.tx(async (db) => {
    const before = await db.get<{ identity_note: string }>("SELECT identity_note FROM users WHERE id = ? AND identity_status = 'pending' FOR UPDATE", userId);
    if (!before) return null;
    const row = await db.get<{ email: string; name: string; handle: string }>(
      "UPDATE users SET identity_status = 'rejected', identity_note = ? WHERE id = ? AND identity_status = 'pending' RETURNING email, name, handle",
      note,
      userId,
    );
    return row ? { ...row, before: { identity_status: "pending", identity_note: before.identity_note } } : null;
  });
}
