import { q, type Track } from "./db";

/**
 * The track columns a sender's receipt uses, and no others. The receiver's decision, notes and the file's storage key
 * stay out: the receipt is the sender's page, and the keep/pass decision is private.
 */
export const RECEIPT_TRACK_COLUMNS = [
  "user_id", "title", "artist", "duration", "peaks", "created_at", "played_at", "downloaded_at", "replied_at",
  "played_out_at", "played_out_note", "stems_requested_at", "stems_sent", "share_ok", "share_terms",
] as const;

export type ReceiptTrack = Pick<Track, (typeof RECEIPT_TRACK_COLUMNS)[number]> & {
  receiver: string;
  receiver_handle: string;
  receiver_status: string | null;
  receiver_plan: string;
  collection: string | null;
  sender_email: string;
  verified_at: number | null;
  sender_account: number | null;
};

/** One receipt by its token, with the receiver, callout and sender details the page shows. */
export function receiptByToken(token: string) {
  const cols = RECEIPT_TRACK_COLUMNS.map((c) => `t.${c}`).join(", ");
  return q.get<ReceiptTrack>(
    `SELECT ${cols}, u.name AS receiver, u.handle AS receiver_handle, u.identity_status AS receiver_status, u.plan AS receiver_plan, c.name AS collection, s.email AS sender_email, s.verified_at, s.account_id AS sender_account
       FROM tracks t JOIN users u ON u.id = t.user_id JOIN senders s ON s.id = t.sender_id
       LEFT JOIN collections c ON c.id = t.collection_id
       WHERE t.token = ?`,
    token,
  );
}
