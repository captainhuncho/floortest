/**
 * The two ways an allowed share consent can end: cancelled inside the window, or made final after it.
 * Both claim the same row (status 'allowed', finalized_at NULL), so exactly one can ever win.
 * Kept free of server-only imports so tests can run them against a real database.
 */
export const CLAIM_FINAL = `UPDATE share_requests SET finalized_at = ? WHERE id = (
  SELECT id FROM share_requests WHERE track_id = ? AND status = 'allowed' AND finalized_at IS NULL AND decided_at <= ? ORDER BY decided_at DESC LIMIT 1
) AND status = 'allowed' AND finalized_at IS NULL RETURNING *`;

export const MARK_SHAREABLE = "UPDATE tracks SET share_ok = 1, share_download = ? WHERE id = ? AND share_ok = 0 RETURNING *";

export const CLAIM_CANCEL = "UPDATE share_requests SET status = 'cancelled' WHERE id = ? AND status = 'allowed' AND finalized_at IS NULL AND decided_at > ?";
