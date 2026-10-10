import "server-only";
import { q, type User } from "@/lib/db";

export type SentRow = {
  token: string; title: string; artist: string; created_at: number; played_at: number | null; downloaded_at: number | null;
  replied_at: number | null; played_out_at: number | null; deleted_at: number | null; receiver: string; handle: string;
};

/** Everything this account has sent, newest first. The receiver's keep/pass decision is private and never included. */
export function sentBy(user: Pick<User, "id" | "email" | "email_verified_at">) {
  return q.all<SentRow>(
    `SELECT t.token, t.title, t.artist, t.created_at, t.played_at, t.downloaded_at, t.replied_at, t.played_out_at, t.deleted_at, u.name AS receiver, u.handle
     FROM tracks t JOIN senders s ON s.id = t.sender_id JOIN users u ON u.id = t.user_id
     WHERE s.account_id = ? OR (? AND lower(s.email) = ?)
     ORDER BY t.created_at DESC LIMIT 200`,
    user.id,
    // Tracks sent from the public link by email only count once this account has proved it owns that email.
    !!user.email_verified_at,
    user.email.toLowerCase(),
  );
}
