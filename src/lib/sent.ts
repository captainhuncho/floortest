import "server-only";
import { q, type User } from "@/lib/db";

export type SentRow = {
  token: string; title: string; artist: string; created_at: number; played_at: number | null; downloaded_at: number | null;
  replied_at: number | null; played_out_at: number | null; receiver: string; handle: string;
};

/**
 * Everything this account has sent, newest first. The receiver's keep/pass decision is private and never included, and
 * neither is when a file left the desk: Not for me files leave after 30 days and undecided ones after 90, so the removal
 * date would give the decision away. A track nobody played shows as not listened to once the 90 days are up (plans.ts).
 */
export function sentBy(user: Pick<User, "id" | "email" | "email_verified_at">) {
  return q.all<SentRow>(
    `SELECT t.token, t.title, t.artist, t.created_at, t.played_at, t.downloaded_at, t.replied_at, t.played_out_at, u.name AS receiver, u.handle
     FROM tracks t JOIN senders s ON s.id = t.sender_id JOIN users u ON u.id = t.user_id
     WHERE ? AND (s.account_id = ? OR lower(s.email) = ?)
     ORDER BY t.created_at DESC LIMIT 200`,
    // Nothing shows until this account has proved it owns its email: until then neither the email match nor an account
    // link (which an unconfirmed account could have made) can be trusted.
    !!user.email_verified_at,
    user.id,
    user.email.toLowerCase(),
  );
}
