import { q, type Track } from "./db";
import { receiptWhere, sealOldReceipt } from "./receipt-token";

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
  /** For the proof check on the server only (src/lib/receipt-proof.ts); never passed to the page's client parts. */
  sender_id: number;
};

/**
 * One receipt by its token, with the receiver, callout and sender details the page shows. An old row without its
 * sealed copy gets one on this first read (src/lib/receipt-token.ts); the token never leaves this function.
 */
export async function receiptByToken(token: string) {
  const m = receiptWhere(token, "t");
  const cols = RECEIPT_TRACK_COLUMNS.map((c) => `t.${c}`).join(", ");
  const r = await q.get<ReceiptTrack & { track_id_: number; plain_: string | null }>(
    `SELECT ${cols}, u.name AS receiver, u.handle AS receiver_handle, u.identity_status AS receiver_status, u.plan AS receiver_plan, c.name AS collection, s.email AS sender_email, s.verified_at, s.account_id AS sender_account, s.id AS sender_id,
            t.id AS track_id_, CASE WHEN t.token_sealed IS NULL THEN t.token END AS plain_
       FROM tracks t JOIN users u ON u.id = t.user_id JOIN senders s ON s.id = t.sender_id
       LEFT JOIN collections c ON c.id = t.collection_id
       WHERE ${m.sql}`,
    ...m.args,
  );
  if (!r) return undefined;
  const { track_id_, plain_, ...receipt } = r;
  if (plain_) await sealOldReceipt(track_id_, plain_).catch((e) => console.error("[receipt] sealing an old token failed", (e as Error).message));
  return receipt as ReceiptTrack;
}
