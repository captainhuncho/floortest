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
